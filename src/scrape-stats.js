const puppeteer = require('puppeteer');
const fs = require('fs').promises;

class ServiceNowScraper {
  constructor(instanceUrl, username, password, instanceName) {
    this.instanceUrl = instanceUrl.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.instanceName = instanceName;
    this.page = null;
  }

  sanitizeError(error) {
    let message = error.message || error.toString();
    message = message.replace(/https?:\/\/[^\s]+/gi, '[INSTANCE_URL]');
    if (this.instanceUrl) {
      const domain = this.instanceUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      message = message.replace(new RegExp(domain, 'gi'), '[INSTANCE]');
    }
    return message;
  }

  async login() {
    console.log(`[${this.instanceName}] Navigating to login page...`);
    const loginUrl = `${this.instanceUrl}/login.do`;

    try {
      await this.page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Check if already logged in
      const isLoggedIn = await this.page.evaluate(() => {
        return document.querySelector('#gsft_main') !== null ||
               document.querySelector('.navpage-main') !== null;
      });

      if (isLoggedIn) {
        console.log(`[${this.instanceName}] Already logged in`);
        return true;
      }

      console.log(`[${this.instanceName}] Filling login form...`);

      await this.page.waitForSelector('#user_name', { visible: true });
      await this.page.type('#user_name', this.username);

      await this.page.waitForSelector('#user_password', { visible: true });
      await this.page.type('#user_password', this.password);

      await this.page.click('#sysverb_login');

      await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });

      const loginSuccess = await this.page.evaluate(() => {
        return window.location.pathname !== '/login.do' &&
               window.location.pathname !== '/login_redirect.do';
      });

      if (!loginSuccess) {
        throw new Error('Login failed - still on login page');
      }

      console.log(`[${this.instanceName}] Login successful`);
      return true;

    } catch (error) {
      console.error(`[${this.instanceName}] Login error:`, this.sanitizeError(error));
      throw error;
    }
  }

  async scrapeStats() {
    console.log(`[${this.instanceName}] Navigating to stats page...`);
    const statsUrl = `${this.instanceUrl}/stats.do`;

    try {
      // stats.do is plain HTML, no need for networkidle2
      await this.page.goto(statsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Validate we actually got stats (not an error page or login redirect)
      const pageText = await this.page.evaluate(() => document.body?.innerText || '');
      if (!pageText.includes('Servlet statistics') && !pageText.includes('Statistics for:')) {
        throw new Error('Stats page did not load expected content');
      }

      // Extract key metrics from the stats page
      const metrics = this.extractMetrics(pageText);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (metrics.instanceState) {
        console.log(`[${this.instanceName}] Instance State: ${metrics.instanceState}`);
      }
      if (metrics.buildTag) {
        console.log(`[${this.instanceName}] Build: ${metrics.buildTag}`);
      }
      if (metrics.memoryFreePercent) {
        console.log(`[${this.instanceName}] Memory free: ${metrics.memoryFreePercent}%`);
      }

      return {
        timestamp,
        instanceName: this.instanceName,
        metrics
      };

    } catch (error) {
      console.error(`[${this.instanceName}] Stats scraping error:`, this.sanitizeError(error));
      throw error;
    }
  }

  extractMetrics(text) {
    const metrics = {};

    const stateMatch = text.match(/Instance State:\s*(\w+)/);
    if (stateMatch) metrics.instanceState = stateMatch[1];

    const buildMatch = text.match(/Build tag:\s*(\S+)/);
    if (buildMatch) metrics.buildTag = buildMatch[1];

    const buildNameMatch = text.match(/Build name:\s*(\S+)/);
    if (buildNameMatch) metrics.buildName = buildNameMatch[1];

    const memMatch = text.match(/Max memory:\s*([\d.]+)\s*Allocated:\s*([\d.]+)\s*In use:\s*([\d.]+)\s*Free percentage:\s*([\d.]+)/);
    if (memMatch) {
      metrics.memoryMax = parseFloat(memMatch[1]);
      metrics.memoryAllocated = parseFloat(memMatch[2]);
      metrics.memoryInUse = parseFloat(memMatch[3]);
      metrics.memoryFreePercent = parseFloat(memMatch[4]);
    }

    const sessionsMatch = text.match(/Logged in sessions:\s*(\d+)/);
    if (sessionsMatch) metrics.loggedInSessions = parseInt(sessionsMatch[1]);

    const transMatch = text.match(/Transactions:\s*(\d+)/);
    if (transMatch) metrics.transactions = parseInt(transMatch[1]);

    const runLevelMatch = text.match(/Current Run Level:\s*(.+)/);
    if (runLevelMatch) metrics.runLevel = runLevelMatch[1].trim();

    const dbLatencyMatch = text.match(/Database latency:\s*(\d+)/);
    if (dbLatencyMatch) metrics.dbLatency = parseInt(dbLatencyMatch[1]);

    return metrics;
  }

  async close() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
  }
}

async function main() {
  let instances = [];

  if (!process.env.SERVICENOW_INSTANCES_JSON) {
    console.error('No ServiceNow instances configured.');
    console.error('Please set SERVICENOW_INSTANCES_JSON environment variable.');
    console.error('Example:');
    console.error('{"instances":[{"name":"prod","url":"https://prod.service-now.com","username":"user","password":"pass"}]}');
    process.exit(1);
  }

  try {
    const config = JSON.parse(process.env.SERVICENOW_INSTANCES_JSON);
    instances = config.instances || [];

    if (!Array.isArray(instances) || instances.length === 0) {
      throw new Error('Configuration must contain an "instances" array with at least one instance');
    }

    instances.forEach((instance, index) => {
      if (!instance.url || !instance.username || !instance.password) {
        throw new Error(`Instance at index ${index} missing required fields (url, username, password)`);
      }
      if (!instance.name) {
        instance.name = `instance-${index + 1}`;
      }
    });
  } catch (error) {
    console.error('Failed to parse SERVICENOW_INSTANCES_JSON:', error.message);
    process.exit(1);
  }

  console.log(`Configured to process ${instances.length} instance(s)`);

  // Single browser shared across all instances
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const results = {
    total: instances.length,
    successful: 0,
    failed: 0,
    failures: [],
    instanceMetrics: {}
  };

  for (const instance of instances) {
    console.log(`\n=== Processing ${instance.name} instance ===`);

    const scraper = new ServiceNowScraper(
      instance.url,
      instance.username,
      instance.password,
      instance.name
    );

    try {
      // Create a fresh page per instance (isolated cookies/session)
      scraper.page = await browser.newPage();
      await scraper.page.setViewport({ width: 1280, height: 800 });
      await scraper.page.setDefaultTimeout(60000);

      await scraper.login();
      const result = await scraper.scrapeStats();

      results.successful++;
      results.instanceMetrics[instance.name] = result.metrics;

    } catch (error) {
      const sanitizedError = scraper.sanitizeError(error);
      console.error(`[${instance.name}] Failed:`, sanitizedError);
      results.failed++;
      results.failures.push({
        instance: instance.name,
        error: sanitizedError
      });
    } finally {
      await scraper.close();
    }
  }

  await browser.close();

  console.log('\n=== All instances processed ===');
  console.log(`Success: ${results.successful}/${results.total}`);
  console.log(`Failed: ${results.failed}/${results.total}`);

  const summary = {
    timestamp: new Date().toISOString(),
    total: results.total,
    successful: results.successful,
    failed: results.failed,
    failures: results.failures,
    instances: results.instanceMetrics
  };

  await fs.writeFile('stats-summary.json', JSON.stringify(summary, null, 2));

  if (results.failed === results.total && results.total > 0) {
    console.error('\nERROR: All instances failed!');
    process.exit(1);
  }

  if (results.failed > results.successful && results.total > 0) {
    console.error(`\nWARNING: More than half of instances failed (${results.failed}/${results.total})`);
    process.exit(2);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
