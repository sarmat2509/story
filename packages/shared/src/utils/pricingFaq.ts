import type { PricingTranslate } from './planPresentation';

export type PricingFaqIcon =
  | 'layers-outline'
  | 'calendar-outline'
  | 'add-circle-outline'
  | 'pricetag-outline'
  | 'card-outline'
  | 'image-outline'
  | 'refresh-outline';

export interface PricingFaqItem {
  id: string;
  title: string;
  answer: string;
  icon: PricingFaqIcon;
}

interface PricingFaqDefinition {
  id: string;
  titleKey: string;
  answerKey: string;
  fallbackTitle: string;
  fallbackAnswer: string;
  icon: PricingFaqIcon;
  answerNoDateKey?: string;
  fallbackAnswerNoDate?: string;
}

const PRICING_FAQ_DEFINITIONS: PricingFaqDefinition[] = [
  {
    id: 'plan-vs-bundle',
    titleKey: 'bundles.faq_1_q',
    answerKey: 'bundles.faq_1_a',
    fallbackTitle: "What's the difference between my plan and a bundle?",
    fallbackAnswer:
      'Bundles are available with an active paid subscription. Your subscription sets the base monthly limits for stories and audio; bundles are one-time add-ons that raise those limits until the end of your current billing period.',
    icon: 'layers-outline',
  },
  {
    id: 'bundle-duration',
    titleKey: 'bundles.faq_2_q',
    answerKey: 'bundles.faq_2_a',
    answerNoDateKey: 'bundles.faq_2_a_no_date',
    fallbackTitle: 'How long do bundle bonuses last?',
    fallbackAnswer:
      'Extra credits from bundles apply until {{periodEnd}}. Anything you do not use expires then and does not roll over.',
    fallbackAnswerNoDate:
      'They apply until the end of your current billing period and do not roll over.',
    icon: 'calendar-outline',
  },
  {
    id: 'bundle-stacking',
    titleKey: 'bundles.faq_3_q',
    answerKey: 'bundles.faq_3_a',
    fallbackTitle: 'Can I buy more than one bundle?',
    fallbackAnswer:
      'Yes. Purchases in the same billing period stack; the extra stories and audio add together.',
    icon: 'add-circle-outline',
  },
  {
    id: 'bundle-pricing',
    titleKey: 'bundles.faq_4_q',
    answerKey: 'bundles.faq_4_a',
    fallbackTitle: 'Why is the bundle price different on higher plans?',
    fallbackAnswer:
      'Higher plans include more illustrations per story, so generation costs more. Bundle prices follow the plan you are on.',
    icon: 'pricetag-outline',
  },
  {
    id: 'bundle-payment',
    titleKey: 'bundles.faq_5_q',
    answerKey: 'bundles.faq_5_a',
    fallbackTitle: 'Where can I pay for a bundle?',
    fallbackAnswer:
      'When payments are enabled, checkout runs on the web. Open this page in a browser and use Buy on a card. Mobile in-app purchase for bundles may follow later.',
    icon: 'card-outline',
  },
  {
    id: 'bundle-scope',
    titleKey: 'bundles.faq_6_q',
    answerKey: 'bundles.faq_6_a',
    fallbackTitle: 'Do bundles change image quality, style, or voices?',
    fallbackAnswer:
      'No. Only your story and audio limits change. Illustration quality, style, and narrator voices stay the same as your plan.',
    icon: 'image-outline',
  },
  {
    id: 'renewal',
    titleKey: 'faq_renewal_q',
    answerKey: 'faq_renewal_a',
    fallbackTitle: 'How do subscriptions renew?',
    fallbackAnswer:
      'Paid subscriptions renew monthly until canceled. You can manage or cancel billing in the billing portal where available.',
    icon: 'refresh-outline',
  },
  {
    id: 'refunds',
    titleKey: 'faq_refunds_q',
    answerKey: 'faq_refunds_a',
    fallbackTitle: 'How do refunds work?',
    fallbackAnswer:
      'Refund requests are reviewed through support and do not happen automatically when a subscription is canceled.',
    icon: 'card-outline',
  },
];

export function buildPricingFaqItems(input: {
  translate: PricingTranslate;
  periodEnd?: string | null;
}): PricingFaqItem[] {
  return PRICING_FAQ_DEFINITIONS.map((definition) => {
    const answerKey =
      input.periodEnd || !definition.answerNoDateKey
        ? definition.answerKey
        : definition.answerNoDateKey;
    const fallbackAnswer =
      input.periodEnd || !definition.fallbackAnswerNoDate
        ? definition.fallbackAnswer
        : definition.fallbackAnswerNoDate;

    return {
      id: definition.id,
      title: input.translate(definition.titleKey, undefined, definition.fallbackTitle),
      answer: input.translate(
        answerKey,
        input.periodEnd ? { periodEnd: input.periodEnd } : undefined,
        fallbackAnswer
      ),
      icon: definition.icon,
    };
  });
}
