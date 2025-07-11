const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const { generateTOTP } = require('./totp-handler');

class DeveloperAccountLogin {
  constructor(accountConfig) {
    this.name = accountConfig.name;
    this.email = accountConfig.email;
    this.password = accountConfig.password;
    this.totpSecret = accountConfig.totpSecret;
    this.browser = null;
    this.page = null;
  }
  
  // Sanitize error messages to remove URLs and sensitive info
  sanitizeError(error) {
    let message = error.message || error.toString();
    // Replace any URL that might appear in error messages
    message = message.replace(/https?:\/\/[^\s]+/gi, '[URL]');
    // Remove email addresses
    message = message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
    // Remove any service-now.com domains
    message = message.replace(/[a-zA-Z0-9.-]*\.service-now\.com/gi, '[SERVICENOW]');
    message = message.replace(/signon\.service-now\.com/gi, '[SSO]');
    message = message.replace(/developer\.servicenow\.com/gi, '[DEVELOPER_PORTAL]');
    return message;
  }

  async init() {
    console.log(`[${this.name}] Initializing browser...`);
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
    
    // Set viewport and timeout
    await this.page.setViewport({ width: 1280, height: 800 });
    await this.page.setDefaultTimeout(60000);
    
    // Set user agent to avoid detection
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }

  async login() {
    console.log(`[${this.name}] Navigating to developer login page...`);
    
    try {
      // Navigate to developer login (ServiceNow SSO)
      await this.page.goto('https://signon.service-now.com/x_snc_sso_auth.do?pageId=login', { 
        waitUntil: 'networkidle2' 
      });
      
      // Wait for any loading overlays to disappear
      console.log(`[${this.name}] Waiting for page to fully load...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check for "Please Wait" or loading indicators
      const hasLoadingIndicator = await this.page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes('please wait') || bodyText.includes('loading');
      });
      
      if (hasLoadingIndicator) {
        console.log(`[${this.name}] Loading indicator detected, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Log current URL
      const currentUrl = await this.page.url();
      
      // Check if already logged in (redirected to developers portal)
      const isLoggedIn = await this.page.evaluate(() => {
        return window.location.hostname === 'developers.servicenow.com' || 
               (window.location.pathname.includes('/dev/') && 
                !window.location.pathname.includes('/login'));
      });
      
      if (isLoggedIn) {
        console.log(`[${this.name}] Already logged in`);
        return true;
      }
      
      // Step 1: Fill email and click Next
      // Try multiple selectors for the email/username field
      const emailSelectors = [
        'input#username',  // The actual ID we found
        'input[name="username"]',  // The actual name we found
        'input[type="email"]',
        'input[name="email"]',
        'input[id="email"]',
        'input[type="text"]'
      ];
      
      let emailFieldFound = false;
      for (const selector of emailSelectors) {
        try {
          await this.page.waitForSelector(selector, { visible: true, timeout: 5000 });
          console.log(`[${this.name}] Found email field with selector: ${selector}`);
          await this.page.type(selector, this.email);
          emailFieldFound = true;
          break;
        } catch (e) {
          // Try next selector
        }
      }
      
      if (!emailFieldFound) {
        throw new Error('Could not find email input field');
      }
      
      // Click Next button
      console.log(`[${this.name}] Clicking Next...`);
      
      // Find the Next button using multiple strategies
      const nextButtonClicked = await this.page.evaluate(() => {
        // Try different ways to find the Next button
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
        const nextButton = buttons.find(btn => 
          btn.innerText?.toLowerCase().includes('next') || 
          btn.value?.toLowerCase().includes('next')
        );
        
        if (nextButton) {
          nextButton.click();
          return true;
        }
        return false;
      });
      
      if (!nextButtonClicked) {
        throw new Error('Could not find Next button');
      }
      
      // Wait for navigation
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      // Step 2: Fill password
      console.log(`[${this.name}] Filling password...`);
      await this.page.waitForSelector('input[type="password"], input[name="password"], input[id="password"]', { visible: true });
      await this.page.type('input[type="password"], input[name="password"], input[id="password"]', this.password);
      
      
      // Submit login form
      console.log(`[${this.name}] Clicking Sign In...`);
      
      // Find and click the Sign In button
      const signInClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
        const signInButton = buttons.find(btn => {
          const text = (btn.innerText || btn.value || '').toLowerCase();
          return text.includes('sign in') || text.includes('log in') || text.includes('submit');
        });
        
        if (signInButton) {
          signInButton.click();
          return true;
        }
        return false;
      });
      
      if (!signInClicked) {
        throw new Error('Could not find Sign In button');
      }
      
      // Wait for navigation
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      // Check for 2FA
      await this.handle2FA();
      
      // Take a screenshot to see where we are after 2FA
      await this.takeScreenshot('08-after-2fa-complete');
      
      // Check if we're on the SSO apps page
      await new Promise(resolve => setTimeout(resolve, 2000));
      const afterLoginUrl = await this.page.url();
      console.log(`[${this.name}] URL after 2FA handling: ${afterLoginUrl}`);
      
      // Check if we're on the SSO apps selection page
      const isOnSSOAppsPage = await this.page.evaluate(() => {
        return window.location.hostname === 'signon.service-now.com' && 
               document.body && 
               document.body.innerText && 
               document.body.innerText.includes('My Apps');
      });
      
      if (isOnSSOAppsPage) {
        console.log(`[${this.name}] On SSO apps page, looking for Developer Program link...`);
        
        // Take a screenshot to debug what's on the page
        try {
          await this.takeScreenshot('sso-apps-page');
        } catch (e) {
          // Ignore screenshot errors
        }
        
        // Click on Developer Program (previously Developer Portal)
        try {
          // Try multiple strategies to find and click the Developer Program link
          const clicked = await this.page.evaluate(() => {
            // Strategy 1: Look for exact text match
            const elements = Array.from(document.querySelectorAll('a, div, button, span, h1, h2, h3, h4, p'));
            const portalElement = elements.find(el => {
              const text = el.innerText || el.textContent || '';
              return text.includes('Developer Program') || text.includes('Developer Portal');
            });
            
            if (portalElement) {
              // Try to find a clickable parent if the element itself isn't clickable
              let clickTarget = portalElement;
              let parent = portalElement.parentElement;
              while (parent && parent !== document.body) {
                if (parent.tagName === 'A' || parent.tagName === 'BUTTON' || parent.onclick) {
                  clickTarget = parent;
                  break;
                }
                parent = parent.parentElement;
              }
              clickTarget.click();
              return true;
            }
            
            // Strategy 2: Look for any link containing developer.servicenow.com
            const devLinks = Array.from(document.querySelectorAll('a[href*="developer.servicenow.com"], a[href*="developers.servicenow.com"]'));
            if (devLinks.length > 0) {
              devLinks[0].click();
              return true;
            }
            
            return false;
          });
          
          if (!clicked) {
            console.log(`[${this.name}] Could not find Developer Program link, attempting direct navigation...`);
            // If we can't find the link, try navigating directly
            await this.page.goto('https://developers.servicenow.com/dev/', { 
              waitUntil: 'networkidle2',
              timeout: 30000 
            });
          } else {
            // Wait a bit for potential navigation
            await Promise.race([
              this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
              new Promise(resolve => setTimeout(resolve, 3000))
            ]);
          }
          
          // Check if we need to handle a new tab/window
          const pages = await this.browser.pages();
          if (pages.length > 1) {
            console.log(`[${this.name}] New tab detected, switching to it...`);
            // Get the newest page that isn't the current one
            const newPage = pages.find(p => p !== this.page);
            if (newPage) {
              // Wait for the new page to load before closing the old one
              await newPage.bringToFront();
              
              // Wait for navigation or timeout after 5 seconds
              try {
                await newPage.waitForNavigation({ 
                  waitUntil: 'networkidle2', 
                  timeout: 5000 
                });
              } catch (e) {
                // If navigation doesn't happen, check if we need to navigate manually
                const newPageUrl = await newPage.url();
                console.log(`[${this.name}] New tab URL: ${newPageUrl}`);
                
                if (newPageUrl === 'about:blank' || !newPageUrl.includes('developers.servicenow.com')) {
                  console.log(`[${this.name}] New tab didn't navigate, manually navigating to developer portal...`);
                  await newPage.goto('https://developers.servicenow.com/dev/', { 
                    waitUntil: 'networkidle2',
                    timeout: 30000 
                  });
                }
              }
              
              // Now close the old page and switch
              await this.page.close();
              this.page = newPage;
            }
          }
        } catch (error) {
          console.error(`[${this.name}] Error handling SSO apps page:`, this.sanitizeError(error));
          // Don't throw here, try to continue
        }
      } else if (afterLoginUrl.includes('signon.service-now.com/sso')) {
        // We're on the SSO page but not the apps selection page
        // This happens when there's only one app or auto-redirect is enabled
        console.log(`[${this.name}] On SSO page, attempting direct navigation to developer portal...`);
        
        try {
          await this.page.goto('https://developers.servicenow.com/dev/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
          });
        } catch (error) {
          console.error(`[${this.name}] Direct navigation error:`, this.sanitizeError(error));
        }
      }
      
      // Verify we're now on the developers portal or SSO apps page
      const finalUrl = await this.page.url();
      console.log(`[${this.name}] Current URL after login: ${finalUrl}`);
      
      // If we ended up on about:blank, try to navigate directly
      if (finalUrl === 'about:blank' || finalUrl === '') {
        console.log(`[${this.name}] Blank page detected, navigating directly to developer portal...`);
        await this.page.goto('https://developers.servicenow.com/dev/', { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
      }
      
      const loginSuccess = await this.page.evaluate(() => {
        return window.location.hostname === 'developers.servicenow.com' ||
               (window.location.hostname === 'signon.service-now.com' && 
                document.body && 
                document.body.innerText && 
                document.body.innerText.includes('My Apps'));
      });
      
      if (!loginSuccess) {
        console.log(`[${this.name}] Not on expected page after login. Current URL: ${finalUrl}`);
        // Don't throw error here, let navigateToInstances handle the navigation
      }
      
      console.log(`[${this.name}] Login successful`);
      
      return true;
      
    } catch (error) {
      console.error(`[${this.name}] Login error:`, this.sanitizeError(error));
      throw error;
    }
  }

  async handle2FA() {
    console.log(`[${this.name}] Checking for 2FA...`);
    
    try {
      // Wait a bit to see if 2FA page appears
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if we're on a 2FA page
      const is2FAPage = await this.page.evaluate(() => {
        if (!document.body || !document.body.innerText) return false;
        const pageText = document.body.innerText.toLowerCase();
        return pageText.includes('two-factor') || 
               pageText.includes('2fa') || 
               pageText.includes('verification code') ||
               pageText.includes('authenticate') ||
               pageText.includes('additional authentication');
      });
      
      if (!is2FAPage) {
        console.log(`[${this.name}] No 2FA required`);
        return;
      }
      
      console.log(`[${this.name}] 2FA page detected`);
      
      // Check if we need to select authentication method
      const needsMethodSelection = await this.page.evaluate(() => {
        const pageText = document.body.innerText;
        return pageText.includes('Change Multifactor Authentication Option') || 
               pageText.includes('Select default verification method');
      });
      
      if (needsMethodSelection) {
        console.log(`[${this.name}] Need to select authentication method...`);
        
        // Find and click the Select button for Authenticator App
        const selectClicked = await this.page.evaluate(() => {
          // Find the authenticator app section
          const sections = Array.from(document.querySelectorAll('div, section, article'));
          const authAppSection = sections.find(section => 
            section.innerText?.includes('Authenticator App') && 
            section.innerText?.includes('verification code generated')
          );
          
          if (authAppSection) {
            // Find the Select button within or near this section
            const buttons = Array.from(authAppSection.querySelectorAll('button, a'));
            const selectButton = buttons.find(btn => 
              btn.innerText?.toLowerCase().includes('select')
            );
            
            if (selectButton) {
              selectButton.click();
              return true;
            }
            
            // Try parent element if not found in section
            const parentButtons = Array.from(authAppSection.parentElement.querySelectorAll('button, a'));
            const parentSelectButton = parentButtons.find(btn => 
              btn.innerText?.toLowerCase().includes('select') &&
              btn.offsetTop > authAppSection.offsetTop &&
              btn.offsetTop < authAppSection.offsetTop + authAppSection.offsetHeight
            );
            
            if (parentSelectButton) {
              parentSelectButton.click();
              return true;
            }
          }
          
          // Fallback: find all Select buttons and click the second one (usually Authenticator App)
          const allSelectButtons = Array.from(document.querySelectorAll('button, a')).filter(btn =>
            btn.innerText?.toLowerCase().includes('select')
          );
          
          if (allSelectButtons.length > 1) {
            allSelectButtons[1].click(); // Second select button is usually for Authenticator App
            return true;
          }
          
          return false;
        });
        
        if (!selectClicked) {
          throw new Error('Could not find Select button for Authenticator App');
        }
        
        // Wait for the code input page to load
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      if (!this.totpSecret) {
        throw new Error('2FA required but no TOTP secret provided');
      }
      
      // Generate TOTP code
      const totpCode = generateTOTP(this.totpSecret);
      console.log(`[${this.name}] Generating TOTP code for 2FA...`);
      
      // Check if we're on email verification page instead of TOTP
      const isEmailVerification = await this.page.evaluate(() => {
        const pageText = document.body.innerText;
        return pageText.includes('MFA code sent to your email') || 
               pageText.includes('Enter 6 digit verification code sent to the email');
      });
      
      if (isEmailVerification) {
        console.log(`[${this.name}] Email verification detected, need to change to Authenticator App...`);
        
        // Click "Change verification method" link
        const changeMethodClicked = await this.page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a, button'));
          const changeLink = links.find(link => 
            link.innerText?.toLowerCase().includes('change verification method')
          );
          
          if (changeLink) {
            changeLink.click();
            return true;
          }
          return false;
        });
        
        if (changeMethodClicked) {
          // Wait for method selection page
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Now select Authenticator App
          const authAppSelected = await this.page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, label, button, a'));
            const authOption = elements.find(el => 
              el.innerText?.includes('Authenticator App') && 
              !el.innerText?.includes('Email Authentication')
            );
            
            if (authOption) {
              // Look for a select button or radio/checkbox near this option
              const parent = authOption.parentElement;
              const selectButton = parent?.querySelector('button, a, input[type="radio"], input[type="checkbox"]');
              
              if (selectButton) {
                selectButton.click();
                return true;
              }
              
              // Try clicking the option itself
              authOption.click();
              return true;
            }
            return false;
          });
          
          if (!authAppSelected) {
            throw new Error('Could not select Authenticator App option');
          }
          
          // Wait and possibly click submit/continue
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const continueClicked = await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
            const continueBtn = buttons.find(btn => {
              const text = (btn.innerText || btn.value || '').toLowerCase();
              return text.includes('continue') || text.includes('submit') || text.includes('next');
            });
            
            if (continueBtn) {
              continueBtn.click();
              return true;
            }
            return false;
          });
          
          // Wait for TOTP input page
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Find and fill TOTP input
      
      // Check what inputs are available on 2FA page
      const inputInfo = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(input => ({
          type: input.type,
          id: input.id
        }));
      });
      
      // Check if we have separate input fields for each digit
      const hasMultipleInputs = inputInfo.some(input => 
        input.id && input.id.includes('verificationCode-')
      );
      
      if (hasMultipleInputs) {
        console.log(`[${this.name}] Found separate input fields for each digit`);
        
        // Type each digit into its respective field
        const codeDigits = totpCode.toString().split('');
        for (let i = 0; i < codeDigits.length; i++) {
          const inputId = `verificationCode-${i}`;
          try {
            await this.page.type(`#${inputId}`, codeDigits[i]);
            // Small delay between digits
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (e) {
            console.error(`[${this.name}] Failed to enter digit ${i + 1}:`, e.message);
          }
        }
      } else {
        // Try to find a single code input field
        console.log(`[${this.name}] Looking for single TOTP input field...`);
        
        const totpSelectors = [
          'input[type="text"]',
          'input[type="number"]',
          'input[type="tel"]',
          'input[name*="code"]',
          'input[name*="totp"]',
          'input[name*="otp"]',
          'input[placeholder*="code"]'
        ];
        
        let totpFieldFound = false;
        for (const selector of totpSelectors) {
          try {
            const elements = await this.page.$$(selector);
            if (elements.length > 0) {
              // Type in the first visible text/number input
              await elements[0].type(totpCode);
              totpFieldFound = true;
              console.log(`[${this.name}] Entered TOTP code using selector: ${selector}`);
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }
        
        if (!totpFieldFound) {
          throw new Error('Could not find TOTP input field');
        }
      }
      
      
      // Wait a moment for the submit button to become enabled
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Submit 2FA
      console.log(`[${this.name}] Looking for Submit button...`);
      const verifyClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
        const verifyButton = buttons.find(btn => {
          const text = (btn.innerText || btn.value || '').toLowerCase();
          return text.includes('verify') || text.includes('submit') || text.includes('continue');
        });
        
        if (verifyButton) {
          // Check if button is disabled
          if (verifyButton.disabled) {
            return false;
          }
          verifyButton.click();
          return true;
        }
        return false;
      });
      
      if (!verifyClicked) {
        console.log(`[${this.name}] Submit button not clicked, trying alternative method...`);
        // Try clicking by ID or class
        try {
          await this.page.click('#challenge-authenticator-submit, button[type="submit"], .btn-primary-md');
          console.log(`[${this.name}] Clicked submit button using selector`);
        } catch (e) {
          console.error(`[${this.name}] Failed to click submit button:`, e.message);
        }
      }
      
      // Wait for navigation after 2FA submission
      console.log(`[${this.name}] Waiting for navigation after 2FA...`);
      
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        console.log(`[${this.name}] Navigation completed after 2FA`);
        
        // Take a screenshot to see where we ended up
        await this.takeScreenshot('07-after-2fa');
        
        const urlAfter2FA = await this.page.url();
        console.log(`[${this.name}] URL after 2FA: ${urlAfter2FA}`);
      } catch (navError) {
        console.error(`[${this.name}] Navigation error after 2FA:`, navError.message);
        // Try to continue anyway
      }
      
      console.log(`[${this.name}] 2FA completed`);
      
    } catch (error) {
      console.error(`[${this.name}] 2FA error:`, this.sanitizeError(error));
      throw error;
    }
  }

  async navigateToInstances() {
    console.log(`[${this.name}] Navigating to instances page...`);
    
    try {
      // First check if we're already on the developer portal
      const currentUrl = await this.page.url();
      console.log(`[${this.name}] Current URL before navigation: ${currentUrl}`);
      
      // If we're not on the developer portal, navigate there first
      if (!currentUrl.includes('developers.servicenow.com')) {
        console.log(`[${this.name}] Not on developer portal, navigating there first...`);
        await this.page.goto('https://developers.servicenow.com/dev/', { 
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Now navigate to instances page
      await this.page.goto('https://developers.servicenow.com/dev/instances', { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Optional: Take screenshot of instances page for verification
      // await this.takeScreenshot('07-instances-page');
      
      // Log instance status if visible
      const instanceInfo = await this.page.evaluate(() => {
        const instances = [];
        const instanceElements = document.querySelectorAll('[data-instance-id], .instance-card, .instance-item');
        
        instanceElements.forEach(el => {
          const name = el.querySelector('.instance-name, h3, h4')?.innerText;
          const status = el.querySelector('.instance-status, .status')?.innerText;
          if (name) {
            instances.push({ name, status: status || 'unknown' });
          }
        });
        
        return instances;
      });
      
      if (instanceInfo.length > 0) {
        console.log(`[${this.name}] Found ${instanceInfo.length} instance(s):`);
        instanceInfo.forEach(inst => {
          console.log(`  - ${inst.name}: ${inst.status}`);
        });
      }
      
      return true;
      
    } catch (error) {
      console.error(`[${this.name}] Navigation error:`, this.sanitizeError(error));
      throw error;
    }
  }

  async takeScreenshot(suffix) {
    // Skip screenshots in production for performance
    if (process.env.SKIP_SCREENSHOTS === 'true') {
      return;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `developer-${this.name}-${suffix}-${timestamp}.png`;
    
    try {
      await this.page.screenshot({ 
        path: filename, 
        fullPage: true 
      });
    } catch (error) {
      console.error(`[${this.name}] Screenshot error:`, this.sanitizeError(error));
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

async function main() {
  // Check for configuration
  if (!process.env.DEVELOPER_ACCOUNTS_JSON) {
    console.error('No developer accounts configured.');
    console.error('Please set DEVELOPER_ACCOUNTS_JSON environment variable.');
    console.error('Example format:');
    console.error('[{"name":"account1","email":"user@example.com","password":"pass","totpSecret":"SECRET"}]');
    process.exit(1);
  }
  
  let accounts = [];
  
  try {
    // Parse configuration
    accounts = JSON.parse(process.env.DEVELOPER_ACCOUNTS_JSON);
    
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('Configuration must be an array with at least one account');
    }
    
    // Validate accounts
    accounts.forEach((account, index) => {
      if (!account.email || !account.password) {
        throw new Error(`Account at index ${index} missing required fields (email, password)`);
      }
      if (!account.name) {
        account.name = `account-${index + 1}`;
      }
    });
    
  } catch (error) {
    console.error('Failed to parse DEVELOPER_ACCOUNTS_JSON:', error.message);
    process.exit(1);
  }
  
  console.log(`Configured to process ${accounts.length} developer account(s)`);
  
  // Track success and failures
  const results = {
    total: accounts.length,
    successful: 0,
    failed: 0,
    failures: []
  };
  
  // Process each account
  for (const account of accounts) {
    console.log(`\n=== Processing ${account.name} ===`);
    
    const login = new DeveloperAccountLogin(account);
    
    try {
      await login.init();
      await login.login();
      await login.navigateToInstances();
      
      console.log(`[${account.name}] Keepalive completed successfully`);
      results.successful++;
      
    } catch (error) {
      const sanitizedError = login.sanitizeError(error);
      console.error(`[${account.name}] Failed:`, sanitizedError);
      results.failed++;
      results.failures.push({
        account: account.name,
        error: sanitizedError
      });
      // Continue with next account
    } finally {
      await login.close();
    }
  }
  
  console.log('\n=== All accounts processed ===');
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
  
  await fs.writeFile('developer-summary.json', JSON.stringify(summary, null, 2));
  
  // Exit with error code if all accounts failed
  if (results.failed === results.total && results.total > 0) {
    console.error('\nERROR: All accounts failed!');
    process.exit(1);
  }
  
  // Exit with warning code if more than 50% failed
  if (results.failed > results.successful && results.total > 0) {
    console.error(`\nWARNING: More than half of accounts failed (${results.failed}/${results.total})`);
    process.exit(2);
  }
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});