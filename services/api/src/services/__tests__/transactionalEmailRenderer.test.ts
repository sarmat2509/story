import assert from 'node:assert';
import { renderTransactionalEmail } from '../transactionalEmailRenderer';

void (async function main() {
  const email = renderTransactionalEmail({
    subject: 'Welcome <Parent>',
    preview: 'Create stories safely',
    title: 'Welcome <Parent>',
    intro: 'Hello <script>alert(1)</script>',
    action: {
      label: 'Open WonderTales',
      url: 'https://wondertales.art/welcome?next=%2Fdashboard',
    },
    sections: [
      {
        title: 'Good next steps',
        items: ['Create a child profile', 'Try your first story'],
      },
      {
        title: 'Security',
        body: 'If this was not you, reset your password.',
        tone: 'security',
      },
    ],
    notices: [
      {
        text: 'This link expires in 1 hour.',
        tone: 'warning',
      },
    ],
    footer: 'This is a transactional email.',
    supportEmail: 'support@wondertales.art',
    brandLogoUrl: 'https://wondertales.art/icon-192.png',
  });

  assert.strictEqual(email.subject, 'Welcome <Parent>');
  assert.match(email.html, /<!doctype html>/i);
  assert.match(email.html, /Create stories safely/);
  assert.match(email.html, /Welcome &lt;Parent&gt;/);
  assert.match(email.html, /Hello &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(email.html, /Hello <script>/);
  assert.match(email.html, /mailto:support@wondertales\.art/);
  assert.match(email.html, /https:\/\/wondertales\.art\/welcome\?next=%2Fdashboard/);
  assert.match(
    email.html,
    /<img src="https:\/\/wondertales\.art\/icon-192\.png"[^>]*alt="WonderTales"/
  );
  assert.doesNotMatch(email.html, />\s*WT\s*</);

  assert.match(email.text, /Open WonderTales: https:\/\/wondertales\.art\/welcome/);
  assert.match(email.text, /Support: support@wondertales\.art/);
  assert.match(email.text, /- Create a child profile/);

  console.log('transactionalEmailRenderer tests passed');
})();
