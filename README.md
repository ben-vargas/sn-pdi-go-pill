# ServiceNow PDI (Performance Diagnostics Information) Monitor

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
git clone https://github.com/yourusername/sn-pdi-monitor.git
cd sn-pdi-monitor
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

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (see `.env.example`):
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run locally:
```bash
npm run test:local
```

### Local Testing with JSON Config

Create a local `instances.json` file and set the environment variable:

```bash
export SERVICENOW_INSTANCES_JSON=$(cat instances.json)
npm run test
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
- ✅ Workflow logs do not expose passwords
- ✅ HTML artifacts are only accessible to repository members
- ✅ Public repository visitors cannot see your workflow runs or artifacts

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