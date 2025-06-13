# ServiceNow PDI (Personal Developer Instance) Monitor

A GitHub Actions-based solution for automatically monitoring ServiceNow `/stats.do` pages across multiple instances. This tool runs on a schedule, logs into ServiceNow instances, captures the stats page HTML, and stores it as GitHub Actions artifacts.

## Features

- ✅ **Unlimited Instance Support** - Monitor any number of ServiceNow instances
- ✅ **Flexible Configuration** - JSON-based configuration for easy management
- ✅ **Scheduled Execution** - Runs every 45 minutes (configurable)
- ✅ **Secure Credential Management** - Uses GitHub Secrets for authentication
- ✅ **Data Storage** - Stores HTML snapshots as GitHub Actions artifacts (7-day retention)
- ✅ **Screenshots** - Captures visual snapshots for verification
- ✅ **No Infrastructure Required** - Runs entirely on GitHub Actions
- ✅ **Sequential Processing** - Simple, reliable execution

## Quick Start

### 1. Fork/Clone this Repository

```bash
git clone https://github.com/ben-vargas/sn-pdi-go-pill.git
cd sn-pdi-go-pill
```

### 2. Configure Your Instances

Create a JSON configuration with your ServiceNow instances:

```json
{
  "instances": [
    {
      "name": "production",
      "url": "https://yourcompany.service-now.com",
      "username": "monitoring-user",
      "password": "secure-password"
    },
    {
      "name": "development",
      "url": "https://yourcompanydev.service-now.com",
      "username": "monitoring-user",
      "password": "secure-password"
    }
  ]
}
```

### 3. Add to GitHub Secrets

1. Go to your repository's Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `SERVICENOW_INSTANCES_JSON`
4. Value: Paste your entire JSON configuration
5. Click "Add secret"

### 4. Enable GitHub Actions

Go to the Actions tab in your repository and enable workflows.

### 5. Run Manually or Wait for Schedule

- **Manual Run**: Go to Actions → ServiceNow Stats Scraper → Run workflow
- **Scheduled**: Automatically runs every 45 minutes

## Configuration

Store your ServiceNow instances configuration in the `SERVICENOW_INSTANCES_JSON` secret:

```json
{
  "instances": [
    {
      "name": "production",
      "url": "https://prod.service-now.com",
      "username": "monitoring-user",
      "password": "secure-password"
    },
    {
      "name": "development",
      "url": "https://dev.service-now.com",
      "username": "monitoring-user",
      "password": "secure-password"
    },
    {
      "name": "test",
      "url": "https://test.service-now.com",
      "username": "monitoring-user",
      "password": "secure-password"
    }
  ]
}
```

You can add as many instances as needed. Each instance must have:
- `url`: The full HTTPS URL to your ServiceNow instance
- `username`: The username for authentication
- `password`: The password for authentication
- `name` (optional): A friendly name for the instance (defaults to `instance-1`, `instance-2`, etc.)

**⚠️ Privacy Warning**: The `name` field will be visible in public GitHub Actions logs. Use generic names instead of revealing instance names (e.g., "prod-1" instead of "company-prod").

## Viewing Collected Data

1. Go to the Actions tab in your repository
2. Click on a completed workflow run
3. Scroll down to "Artifacts"
4. Download the `servicenow-stats-{number}` artifact
5. Extract to view HTML files and screenshots

## Local Development

### Prerequisites
- Node.js 20 or higher
- npm

### Setup

1. Install dependencies (REQUIRED - do this first!):
```bash
npm install
```

2. Create your instances configuration:
```bash
# Copy the example file
cp instances.json.example instances.json
# Edit with your actual ServiceNow instances
nano instances.json  # or use your preferred editor
```

3. Test your configuration:
```bash
# Set the environment variable
export SERVICENOW_INSTANCES_JSON=$(cat instances.json)
# Run the scraper
npm run test
```

The scraper will:
- Process each instance sequentially
- Save HTML files as `stats-{instance-name}-{timestamp}.html`
- Save screenshots as `screenshot-{instance-name}-{timestamp}.png`
- Continue processing even if one instance fails

### Alternative: Using .env file

For repeated local testing:
```bash
cp .env.example .env
# Add your JSON to .env file
# Then run with dotenv:
npm run test:local
```

## Changing the Schedule

Edit `.github/workflows/scrape-stats.yml`:

```yaml
on:
  schedule:
    - cron: '*/45 * * * *'  # Change this cron expression
```

Common schedules:
- Every hour: `0 * * * *`
- Every 30 minutes: `*/30 * * * *`
- Daily at 2 AM: `0 2 * * *`
- Every 6 hours: `0 */6 * * *`

## Security Considerations

- ✅ All credentials are stored as encrypted GitHub Secrets
- ✅ No sensitive data is committed to the repository
- ✅ Workflow logs do not expose passwords or URLs
- ✅ ServiceNow instance URLs are hidden from logs (as of latest version)
- ✅ HTML artifacts require authentication to download
- ⚠️ Instance names (from your config) ARE visible in public logs
- ⚠️ Workflow run times and status are publicly visible

## Troubleshooting

### Login Failures
- Verify credentials in GitHub Secrets
- Check if the instance requires VPN access
- Ensure the user has appropriate permissions
- Validate JSON syntax if using JSON configuration

### Timeout Errors
- Some instances may be slow; the script has a 60-second timeout
- Check if the instance is under maintenance

### No Data Collected
- Check the Actions tab for error logs
- Verify the instance URL includes `https://`
- Ensure GitHub Actions is enabled for the repository
- Validate your JSON configuration format

### JSON Configuration Issues
- Use a JSON validator to check syntax
- Ensure all instances have required fields: `url`, `username`, `password`
- Check that the secret name is exactly `SERVICENOW_INSTANCES_JSON`

## Adding or Removing Instances

Simply update your `SERVICENOW_INSTANCES_JSON` secret with the new configuration. No code changes required!

## Frequently Asked Questions (FAQ)

### What information is visible in public GitHub Actions logs?

In public repositories, anyone can see:
- When your workflows run
- Instance names from your configuration (the `name` field)
- Success/failure status
- Console output (but NOT secrets)

They CANNOT see:
- Your ServiceNow URLs (hidden as of latest version)
- Usernames or passwords (masked by GitHub)
- Downloaded artifacts (requires authentication)

### How do I test the configuration locally before pushing?

```bash
# Create instances.json with your configuration
# Set the environment variable
export SERVICENOW_INSTANCES_JSON=$(cat instances.json)
# Run the test
npm run test
```

### Do scheduled workflows start automatically?

Yes! Once the workflow file is pushed to your default branch (main), the schedule activates automatically. The first run will occur at the next scheduled time (e.g., if you push at 1:20 and schedule is */45, it will run at 1:45).

### What happens if my repository is inactive for 60 days?

GitHub disables scheduled workflows after 60 days of no repository activity. You'll receive an email warning before this happens. To keep it active:
- Make any commit, open an issue, or create a release
- Or simply re-enable workflows in the Actions tab when needed

Note: Scheduled workflow runs do NOT count as activity.

### Should I use Repository Secrets or Environment Secrets?

Use Repository Secrets (recommended for this project):
- Simpler setup
- Available to all workflows
- Perfect for single-workflow projects

Environment Secrets are only needed if:
- You want deployment approvals
- You need environment-specific configurations
- You have multiple workflows with different access needs

### How do I delete old workflow runs?

1. Go to the Actions tab
2. Click on a workflow run
3. Click the "..." menu
4. Select "Delete workflow run"

This permanently removes logs and artifacts.

### Can I make my repository private later?

Yes! Making the repository private will:
- Hide all Actions logs from public view
- Require authentication to see anything
- Give you 2,000 free Actions minutes/month
- Not affect your existing setup

### What if the export command gives me an error?

If you get an error with:
```bash
export SERVICENOW_INSTANCES_JSON=$(cat instances.json)
```

Try:
1. Ensure instances.json exists in your current directory
2. Check the JSON syntax is valid
3. On Windows, use different syntax or run in Git Bash

### How can I verify my JSON configuration?

Before adding to GitHub Secrets:
1. Validate JSON syntax at [jsonlint.com](https://jsonlint.com)
2. Test locally with the export command
3. Ensure all instances have required fields: `url`, `username`, `password`

## Limitations

- No support for 2FA authentication (see Future Enhancements)
- Sequential processing (one instance at a time)
- 7-day retention for collected data
- No built-in alerting (relies on GitHub's email notifications)

## Future Enhancements

The following features were considered but simplified for the initial implementation:

1. **2FA Support** - Could be added using TOTP libraries
2. **Parallel Execution** - Matrix strategy for concurrent instance processing
3. **Extended Retention** - External storage integration for longer data retention
4. **Advanced Notifications** - Slack, PagerDuty, or custom webhook integrations
5. **Data Analysis** - Parse and analyze stats.do content
6. **Custom Scheduling** - Per-instance schedule configuration
7. **Dashboard** - Web interface for viewing historical data

Community contributions for these enhancements are welcome!

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

Please ensure:
- No credentials or sensitive data in code
- Tests pass locally
- Documentation is updated

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review [GitHub Actions logs](../../actions)
3. Open an [issue](../../issues)

---

**Note**: This tool is not affiliated with ServiceNow. Use responsibly and in accordance with your organization's policies.