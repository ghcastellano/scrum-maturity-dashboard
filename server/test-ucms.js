import JiraService from './src/services/jiraService.js';
import dotenv from 'dotenv';

dotenv.config();

const jiraUrl = process.env.JIRA_URL;
const email = process.env.JIRA_EMAIL;
const apiToken = process.env.JIRA_API_TOKEN;

console.log('\n🔍 Testing UCMS Scrum Board\n');
console.log('Jira URL:', jiraUrl);
console.log('Email:', email);
console.log('API Token:', apiToken ? '✓ Set' : '✗ Not set');

async function testUCMS() {
  try {
    const jira = new JiraService(jiraUrl, email, apiToken);

    // 1. Get all boards
    console.log('\n📋 Fetching all boards...');
    const boards = await jira.getBoards();
    const ucmsBoard = boards.find(b => b.name.includes('UCMS'));

    if (!ucmsBoard) {
      console.log('❌ UCMS Scrum Board not found!');
      console.log('Available boards:', boards.map(b => `  - ${b.name} (ID: ${b.id})`).join('\n'));
      return;
    }

    console.log('✓ Found UCMS Board:', ucmsBoard.name, '(ID:', ucmsBoard.id, ')');

    // 2. Get sprints
    console.log('\n📅 Fetching sprints...');
    const sprints = await jira.getSprints(ucmsBoard.id, 'closed');
    console.log(`✓ Found ${sprints.length} closed sprints`);

    if (sprints.length === 0) {
      console.log('❌ No closed sprints found!');
      return;
    }

    console.log('Most recent sprint:', sprints[0].name);

    // 3. Get issues from most recent sprint
    console.log('\n📝 Fetching issues from most recent sprint...');
    const issues = await jira.getSprintIssues(sprints[0].id);
    console.log(`✓ Found ${issues.length} issues`);

    if (issues.length === 0) {
      console.log('❌ No issues found in sprint!');
      return;
    }

    // 4. Analyze first issue to find story points field
    console.log('\n🔎 Analyzing issue fields...');
    const sampleIssue = issues[0];
    console.log('Sample issue:', sampleIssue.key, '-', sampleIssue.fields.summary);

    // Find all custom fields with numeric values
    console.log('\n📊 Numeric custom fields:');
    Object.keys(sampleIssue.fields).forEach(fieldKey => {
      if (fieldKey.startsWith('customfield_')) {
        const value = sampleIssue.fields[fieldKey];
        if (typeof value === 'number') {
          console.log(`  ${fieldKey} = ${value}`);
        }
      }
    });

    // Check the configured field
    const configuredField = 'customfield_10061';
    console.log('\n⚙️  Configured story points field:', configuredField);
    console.log('Value:', sampleIssue.fields[configuredField] || 'null/undefined');

    // Show summary of all issues
    console.log('\n📈 Issues summary:');
    let withPoints = 0;
    let withoutPoints = 0;

    issues.forEach(issue => {
      const points = issue.fields[configuredField];
      if (points && points > 0) {
        withPoints++;
      } else {
        withoutPoints++;
      }
    });

    console.log(`  With story points: ${withPoints}`);
    console.log(`  Without story points: ${withoutPoints}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

testUCMS();
