# PostHog Dashboards Setup (M5)

Dashboards are configured manually in PostHog UI after the analytics integration is deployed.

## Activation Dashboard

**Metric:** Users who created a story in their first 7 days.

- **Event:** `story_created`
- **Filter:** First 7 days since user registration (use PostHog "Time to first event" or cohort)
- **Insight:** Count of users with `story_created` within 7 days of signup

## Conversion Dashboard

**Metric:** Funnel from story creation to plan upgrade.

- **Events:** `story_created` → `plan_upgraded`
- **Funnel:** Step 1: `story_created`, Step 2: `plan_upgraded`
- **Insight:** Conversion rate (plan_upgraded / story_created)

## Retention Dashboard

**Metric:** Users returning to create stories or listen to audio.

- **Events:** `story_created` or `audio_started`
- **Cohorts:** D1, D7, D30 (users active on day 1, 7, 30 after signup)
- **Insight:** Retention by cohort (e.g., % of D0 users with story_created on D7)

## Key Events Available


| Event                     | Description                   |
| ------------------------- | ----------------------------- |
| `story_created`           | Story generation completed    |
| `story_generation_started`| User clicked Generate in wizard |
| `story_shared`            | User shared a story           |
| `story_completed`         | Audio played to end           |
| `audio_started`           | Audio playback started        |
| `plan_upgraded`           | User upgraded subscription    |
| `image_generation_failed` | Image generation failed       |
| `audio_generation_failed` | Audio generation failed       |
| `retry_images_clicked`    | User clicked retry for images |
| `retry_audio_clicked`     | User clicked retry for audio  |

## story_generation_started Properties

**Artisan wizard** (`wizard_type: 'artisan'`):
- `scenario_card_id` — selected scenario
- `has_characters` — user selected at least one character
- `has_children` — user selected at least one child as character
- `has_goal` — user selected a moral goal
- `has_image_style` — user selected image style
- `has_user_notes` — user added custom notes
- `has_child_profile` — user selected child profile (story for)
- `character_count`, `children_count`

**Instant wizard** (`wizard_type: 'instant'`):
- `scenario_card_id` — selected scenario
- `has_photos` — user uploaded photos
- `photo_count` — number of photos
- `age_group` — e.g. '4-5', '6-7'

## Wizard Usage Insights

- **Event:** `story_generation_started`
- **Filter:** `wizard_type = 'artisan'` for artisan wizard
- **Breakdown by:** `has_characters`, `has_children`, `has_goal`, `has_image_style`, `has_user_notes`
- **Character selection rate:** `has_characters = true` / total
- **Scenario card usage:** breakdown by `scenario_card_id`
- **Instant wizard:** `has_photos` distribution, `photo_count` breakdown

## Setup Steps

1. Log in to PostHog project
2. Create new Dashboard
3. Add Insights for each metric above
4. Use Filters to scope by date range, user properties, etc.

