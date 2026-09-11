// Campaign email templates with pre-built HTML and variable placeholders.
// Templates are version-controlled (not in DB) for easy updates.

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  iconName: string; // lucide icon name
  type: 'campaign' | 'downtime' | 'notice' | 'other';
  subject: string;
  text: string;
  html: string;
}

const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 600px;
  margin: 0 auto;
`;

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from scratch with a blank canvas.',
    iconName: 'FileEdit',
    type: 'campaign',
    subject: '',
    text: '',
    html: '',
  },
  {
    id: 'downtime',
    name: 'Downtime Notice',
    description: 'Scheduled maintenance, outages, or service disruptions.',
    iconName: 'AlertTriangle',
    type: 'downtime',
    subject: 'Scheduled Maintenance — {{date}}',
    text: `Dear {{customer.name}},

We are writing to inform you of scheduled maintenance that will affect your service.

Date: {{date}}
Duration: {{duration}}
Affected Area: {{region}}
Reason: {{reason}}

During this time, you may experience intermittent connectivity issues. We recommend saving any important work before the maintenance window.

We apologize for any inconvenience and appreciate your understanding.

If you have questions, please contact our support team.

Best regards,
I-World Networks Support Team`,
    html: `<div style="${BASE_STYLE}">
  <div style="background: #fef3cd; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
    <strong style="color: #92400e;">⚠️ Scheduled Maintenance</strong>
  </div>

  <p>Dear <strong>{{customer.name}}</strong>,</p>

  <p>We are writing to inform you of scheduled maintenance that will affect your service.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; width: 140px;">Date</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">{{date}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold;">Duration</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">{{duration}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold;">Affected Area</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">{{region}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; font-weight: bold;">Reason</td>
      <td style="padding: 8px 12px;">{{reason}}</td>
    </tr>
  </table>

  <p>During this time, you may experience intermittent connectivity issues. We recommend saving any important work before the maintenance window.</p>

  <p>We apologize for any inconvenience and appreciate your understanding.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

  <p style="font-size: 12px; color: #666;">
    If you have questions, please contact our support team.<br/>
    Best regards,<br/>
    <strong>I-World Networks</strong> Support Team
  </p>
</div>`,
  },
  {
    id: 'service-update',
    name: 'Service Update',
    description: 'Plan changes, upgrades, policy updates, or new features.',
    iconName: 'RefreshCw',
    type: 'notice',
    subject: 'Important Update: {{update_title}}',
    text: `Dear {{customer.name}},

We have an important update regarding your service.

{{update_body}}

What this means for you:
• {{impact_1}}
• {{impact_2}}
• {{impact_3}}

Effective Date: {{effective_date}}

If you have questions about this change, our support team is ready to help.

Best regards,
I-World Networks Team`,
    html: `<div style="${BASE_STYLE}">
  <div style="background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
    <strong style="color: #0369a1;">🔄 Service Update</strong>
  </div>

  <p>Dear <strong>{{customer.name}}</strong>,</p>

  <p>We have an important update regarding your service.</p>

  <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
    {{update_body}}
  </div>

  <h3 style="font-size: 16px; margin: 24px 0 12px;">What this means for you:</h3>
  <ul style="padding-left: 20px;">
    <li>{{impact_1}}</li>
    <li>{{impact_2}}</li>
    <li>{{impact_3}}</li>
  </ul>

  <p><strong>Effective Date:</strong> {{effective_date}}</p>

  <p>If you have questions about this change, our support team is ready to help.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

  <p style="font-size: 12px; color: #666;">
    Best regards,<br/>
    <strong>I-World Networks</strong> Team
  </p>
</div>`,
  },
  {
    id: 'promotional',
    name: 'Promotional',
    description: 'Marketing campaigns, product launches, offers, and events.',
    iconName: 'Target',
    type: 'campaign',
    subject: '{{offer_headline}}',
    text: `Dear {{customer.name}},

{{offer_body}}

Special Offer:
• Plan: {{plan_name}}
• Price: {{price}}
• Valid until: {{expiry}}

Don't miss out — upgrade today!

To take advantage of this offer, contact our sales team or visit our office.

Best regards,
I-World Networks Sales Team`,
    html: `<div style="${BASE_STYLE}">
  <div style="background: linear-gradient(135deg, #448515 0%, #2d5a0e 100%); color: white; padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">{{offer_headline}}</h1>
  </div>

  <div style="padding: 32px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear <strong>{{customer.name}}</strong>,</p>

    <p>{{offer_body}}</p>

    <div style="background: #f0fdf4; border: 2px solid #448515; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
      <p style="margin: 0 0 8px; font-size: 14px; color: #166534;">Special Offer</p>
      <p style="margin: 0; font-size: 20px; font-weight: bold; color: #14532d;">{{plan_name}}</p>
      <p style="margin: 8px 0 0; font-size: 28px; font-weight: bold; color: #448515;">{{price}}</p>
      <p style="margin: 8px 0 0; font-size: 12px; color: #666;">Valid until {{expiry}}</p>
    </div>

    <p style="text-align: center;">
      <a href="https://portal.iwn.ng" style="display: inline-block; background: #448515; color: white; padding: 12px 32px; border-radius: 24px; text-decoration: none; font-weight: bold;">
        Contact Sales
      </a>
    </p>

    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

    <p style="font-size: 12px; color: #666; text-align: center;">
      <strong>I-World Networks</strong><br/>
      Your trusted internet partner
    </p>
  </div>
</div>`,
  },
];

/**
 * Get a template by ID.
 */
export function getTemplate(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id);
}

/**
 * Replace {{variable}} placeholders in text with sample data.
 */
export function renderTemplate(template: CampaignTemplate, sampleData?: Record<string, string>): string {
  const defaults: Record<string, string> = {
    'customer.name': 'Valued Customer',
    'date': new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    'duration': '4 hours',
    'region': 'Sagamu',
    'reason': 'Network infrastructure upgrade',
    'update_title': 'Service Improvement',
    'update_body': 'We are upgrading our network infrastructure to provide faster and more reliable service.',
    'impact_1': 'Faster speeds during peak hours',
    'impact_2': 'Improved reliability and uptime',
    'impact_3': 'Better support response times',
    'effective_date': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    'offer_headline': 'Upgrade Your Speed Today!',
    'offer_body': 'For a limited time, enjoy faster speeds at a special price.',
    'plan_name': '50Mbps Fibre Plan',
    'price': '₦15,000/month',
    'expiry': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  };

  const data = { ...defaults, ...sampleData };

  let result = template.text;
  let resultHtml = template.html;

  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    result = result.replaceAll(placeholder, value);
    resultHtml = resultHtml.replaceAll(placeholder, value);
  }

  // Return HTML if available, otherwise text
  return resultHtml || result;
}
