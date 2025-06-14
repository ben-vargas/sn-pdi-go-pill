const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class ServiceNowScraper {
  constructor(instanceUrl, username, password, instanceName) {
    this.instanceUrl = instanceUrl.replace(/\/$/, ''); // Remove trailing slash
    this.username = username;
    this.password = password;
    this.instanceName = instanceName;
    this.browser = null;
    this.page = null;
  }
  
  // Sanitize error messages to remove URLs
  sanitizeError(error) {
    let message = error.message || error.toString();
    // Replace any URL that might appear in error messages
    message = message.replace(/https?:\/\/[^\s]+/gi, '[INSTANCE_URL]');
    // Also replace any domain names that might appear
    if (this.instanceUrl) {
      const domain = this.instanceUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      message = message.replace(new RegExp(domain, 'gi'), '[INSTANCE]');
    }
    return message;
  }

  async init() {
    console.log(`Initializing browser...`);
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    this.page = await this.browser.newPage();
    
    // Set a reasonable viewport
    await this.page.setViewport({ width: 1280, height: 800 });
    
    // Set longer timeout for slow instances
    await this.page.setDefaultTimeout(60000);
  }

  async login() {
    console.log('Navigating to login page...');
    const loginUrl = `${this.instanceUrl}/login.do`;
    
    try {
      await this.page.goto(loginUrl, { waitUntil: 'networkidle2' });
      
      // Check if already logged in by looking for common ServiceNow elements
      const isLoggedIn = await this.page.evaluate(() => {
        return document.querySelector('#gsft_main') !== null || 
               document.querySelector('.navpage-main') !== null;
      });
      
      if (isLoggedIn) {
        console.log('Already logged in');
        return true;
      }
      
      console.log('Filling login form...');
      
      // Wait for and fill username
      await this.page.waitForSelector('#user_name', { visible: true });
      await this.page.type('#user_name', this.username);
      
      // Fill password
      await this.page.waitForSelector('#user_password', { visible: true });
      await this.page.type('#user_password', this.password);
      
      // Click login button
      await this.page.click('#sysverb_login');
      
      // Wait for navigation after login
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      // Verify login success
      const loginSuccess = await this.page.evaluate(() => {
        return window.location.pathname !== '/login.do' && 
               window.location.pathname !== '/login_redirect.do';
      });
      
      if (!loginSuccess) {
        throw new Error('Login failed - still on login page');
      }
      
      console.log('Login successful');
      return true;
      
    } catch (error) {
      console.error('Login error:', this.sanitizeError(error));
      throw error;
    }
  }

  async scrapeStats() {
    console.log('Navigating to stats page...');
    const statsUrl = `${this.instanceUrl}/stats.do`;
    
    try {
      await this.page.goto(statsUrl, { waitUntil: 'networkidle2' });
      
      // Wait for stats content to load
      await this.page.waitForSelector('body', { visible: true });
      
      // Get the HTML content
      const htmlContent = await this.page.content();
      
      // Take a screenshot for verification
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      const screenshotPath = `screenshot-${this.instanceName}-${timestamp}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved: ${screenshotPath}`);
      
      return {
        html: htmlContent,
        screenshot: screenshotPath,
        timestamp: timestamp,
        instanceName: this.instanceName
      };
      
    } catch (error) {
      console.error('Stats scraping error:', this.sanitizeError(error));
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

async function main() {
  let instances = [];
  
  // Check if we have a JSON configuration
  if (!process.env.SERVICENOW_INSTANCES_JSON) {
    console.error('No ServiceNow instances configured.');
    console.error('Please set SERVICENOW_INSTANCES_JSON environment variable with a JSON configuration.');
    console.error('Example:');
    console.error('{"instances":[{"name":"prod","url":"https://prod.service-now.com","username":"user","password":"pass"}]}');
    process.exit(1);
  }
  
  try {
    // Parse JSON configuration from environment variable
    const config = JSON.parse(process.env.SERVICENOW_INSTANCES_JSON);
    instances = config.instances || [];
    
    if (!Array.isArray(instances) || instances.length === 0) {
      throw new Error('Configuration must contain an "instances" array with at least one instance');
    }
    
    // Validate each instance has required fields
    instances.forEach((instance, index) => {
      if (!instance.url || !instance.username || !instance.password) {
        throw new Error(`Instance at index ${index} missing required fields (url, username, password)`);
      }
      // Add a name if not provided
      if (!instance.name) {
        instance.name = `instance-${index + 1}`;
      }
    });
  } catch (error) {
    console.error('Failed to parse SERVICENOW_INSTANCES_JSON:', error.message);
    console.error('Please ensure the JSON is valid and follows the required format.');
    process.exit(1);
  }
  
  console.log(`Configured to process ${instances.length} instance(s)`);
  
  // Track success and failures
  const results = {
    total: instances.length,
    successful: 0,
    failed: 0,
    failures: []
  };
  
  // Process each instance sequentially
  for (const instance of instances) {
    console.log(`\n=== Processing ${instance.name} instance ===`);
    
    const scraper = new ServiceNowScraper(
      instance.url,
      instance.username,
      instance.password,
      instance.name
    );
    
    try {
      await scraper.init();
      await scraper.login();
      const result = await scraper.scrapeStats();
      
      // Save HTML content with instance name for organization
      const htmlPath = `stats-${instance.name}-${result.timestamp}.html`;
      await fs.writeFile(htmlPath, result.html);
      console.log(`HTML saved: ${htmlPath}`);
      
      results.successful++;
      
    } catch (error) {
      const sanitizedError = scraper.sanitizeError(error);
      console.error(`Failed to process ${instance.name}:`, sanitizedError);
      results.failed++;
      results.failures.push({
        instance: instance.name,
        error: sanitizedError
      });
      // Continue with next instance rather than failing entirely
    } finally {
      await scraper.close();
    }
  }
  
  console.log('\n=== All instances processed ===');
  console.log(`Success: ${results.successful}/${results.total}`);
  console.log(`Failed: ${results.failed}/${results.total}`);
  
  // Write summary file for GitHub Actions
  const summary = {
    timestamp: new Date().toISOString(),
    total: results.total,
    successful: results.successful,
    failed: results.failed,
    failures: results.failures
  };
  
  await fs.writeFile('stats-summary.json', JSON.stringify(summary, null, 2));
  
  // Exit with error code if all instances failed
  if (results.failed === results.total && results.total > 0) {
    console.error('\nERROR: All instances failed!');
    process.exit(1);
  }
  
  // Exit with warning code if more than 50% failed
  if (results.failed > results.successful && results.total > 0) {
    console.error(`\nWARNING: More than half of instances failed (${results.failed}/${results.total})`);
    process.exit(2);
  }
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});