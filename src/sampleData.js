// Bundled demo content, used when Reddit can't be reached (offline, blocked
// network, or CORS proxies down). Shaped like Reddit's API objects.

const now = Math.floor(Date.now() / 1000);
const ago = (minutes) => now - minutes * 60;

// A small inline illustration so the image post works without network access.
const FOGGY_HILLS = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">' +
  '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d8b8"/><stop offset="1" stop-color="#dfe6ee"/></linearGradient></defs>' +
  '<rect width="480" height="270" fill="url(#s)"/><circle cx="360" cy="90" r="28" fill="#fbe7c6"/>' +
  '<path d="M0 170 Q120 110 240 160 T480 140 V270 H0Z" fill="#8fa3b5"/>' +
  '<rect y="150" width="480" height="40" fill="#fff" opacity=".45"/>' +
  '<path d="M0 210 Q140 160 280 205 T480 190 V270 H0Z" fill="#5d7489"/>' +
  '<rect y="200" width="480" height="30" fill="#fff" opacity=".35"/></svg>');

const post = (id, subreddit, author, title, minutes, extra = {}) => ({
  id,
  subreddit,
  author,
  title,
  created_utc: ago(minutes),
  score: extra.score ?? 1200,
  num_comments: extra.num_comments ?? 3,
  selftext: extra.selftext || '',
  selftext_html: extra.selftext ? `<div class="md"><p>${extra.selftext.split('\n\n').join('</p><p>')}</p></div>` : '',
  is_self: !extra.url,
  url: extra.url,
  domain: extra.domain || (extra.url ? new URL(extra.url).hostname : `self.${subreddit}`),
  post_hint: extra.post_hint,
  permalink: `/r/${subreddit}/comments/${id}/`,
  offline: true,
});

export const samplePosts = [
  post('demo1', 'AskReddit', 'curious_cat_42', 'What is a small habit that noticeably improved your life?', 14, {
    score: 18432, num_comments: 4,
    selftext: 'Looking for low-effort, high-reward stuff. Bonus points if it takes less than five minutes a day.',
  }),
  post('demo2', 'programming', 'segfault_sally', 'I rewrote our build in a weekend and cut CI time from 40 minutes to 6', 47, {
    score: 3421, num_comments: 3,
    selftext: 'Most of it was caching and running tests in parallel. The rest was deleting a step nobody remembered adding in 2019.\n\nHappy to answer questions.',
  }),
  post('demo3', 'todayilearned', 'factual_fern', 'TIL octopuses have three hearts, and two of them stop beating when they swim', 95, {
    score: 25110, num_comments: 2, url: 'https://en.wikipedia.org/wiki/Octopus',
  }),
  post('demo4', 'pics', 'shutterbug_88', 'Fog rolling over the hills this morning', 130, {
    score: 9876, num_comments: 2, post_hint: 'image', domain: 'i.redd.it', url: FOGGY_HILLS,
  }),
  post('demo5', 'worldnews', 'news_bot_3000', 'International team announces breakthrough in grid-scale battery storage', 210, {
    score: 15002, num_comments: 1, url: 'https://example.com/news/battery-storage',
  }),
  post('demo6', 'gaming', 'pixel_pusher', 'After 400 hours I finally finished my first no-damage run', 320, {
    score: 6420, num_comments: 2,
    selftext: 'My hands are shaking. The final boss took 212 attempts. Worth it.',
  }),
  post('demo7', 'funny', 'dadjoke_dispenser', 'My code review comment was just "why" and honestly that was fair', 400, {
    score: 4410, num_comments: 1,
    selftext: 'Context: I named a variable `thing2_final_REAL`.',
  }),
  post('demo8', 'AskReddit', 'night_owl_99', 'What is something that is way more fun than it has any right to be?', 600, {
    score: 7300, num_comments: 2,
  }),
];

const c = (id, author, body, minutes, score, replies = []) => ({
  kind: 't1',
  data: {
    id, author, body, created_utc: ago(minutes), score,
    body_html: `<div class="md"><p>${body}</p></div>`,
    replies: replies.length ? { data: { children: replies } } : '',
  },
});

export const sampleComments = {
  demo1: [
    c('d1a', 'hydration_station', 'Keeping a full water bottle on my desk. I drink twice as much without thinking about it.', 12, 4210, [
      c('d1b', 'curious_cat_42', 'Same. The trick is making it the path of least resistance.', 10, 880, [
        c('d1c', 'hydration_station', 'Exactly. Out of sight, out of mind works both ways.', 8, 312),
      ]),
    ]),
    c('d1d', 'tidy_tim', 'Putting things back right after I use them. My apartment has never been cleaner.', 11, 2900),
  ],
  demo2: [
    c('d2a', 'yaml_wrangler', 'The step nobody remembered adding is always the slowest one.', 40, 1500, [
      c('d2b', 'segfault_sally', 'It was uploading a 2 GB artifact to a bucket nobody reads. Every run.', 35, 1320),
    ]),
    c('d2c', 'pm_paula', 'Can you share the before/after config?', 30, 210),
  ],
  demo3: [
    c('d3a', 'marine_mike', 'Which is why they prefer crawling. Swimming is literally exhausting for them.', 90, 3300, [
      c('d3b', 'factual_fern', 'Nature is wild.', 85, 900),
    ]),
  ],
  demo4: [
    c('d4a', 'landscape_lou', 'Gorgeous. What time did you have to get up for this?', 120, 410, [
      c('d4b', 'shutterbug_88', '5 am. Worth every minute.', 115, 260),
    ]),
  ],
  demo5: [c('d5a', 'grid_nerd', 'Storage is the missing piece for renewables. Great to see progress.', 200, 2200)],
  demo6: [
    c('d6a', 'speedrun_sam', '212 attempts is dedication. Congrats!', 300, 700, [
      c('d6b', 'pixel_pusher', 'Thanks! Attempt 211 was the real heartbreak.', 290, 450),
    ]),
  ],
  demo7: [c('d7a', 'senior_dev_dan', 'As the reviewer: I stand by "why".', 390, 1900)],
  demo8: [
    c('d8a', 'bubble_wrap_fan', 'Bubble wrap. Every single time.', 590, 1600),
    c('d8b', 'karaoke_kim', 'Karaoke with people who are equally bad at singing.', 580, 1100),
  ],
};

// Shown in "boss mode": dull, believable work email.
export const bossEmails = [
  { from: 'Facilities Team', subject: 'Reminder: Kitchen refrigerator cleanout Friday 4 PM', preview: 'All items left in the refrigerator after 4 PM on Friday will be discarded...', time: '9:12 AM' },
  { from: 'Karen Whitfield', subject: 'RE: Q3 budget reconciliation – updated figures', preview: 'Thanks, I have updated the variance column. Please review tab 3 before...', time: '8:47 AM' },
  { from: 'IT Service Desk', subject: 'Scheduled maintenance: VPN gateway (Saturday 02:00–04:00)', preview: 'During this window remote access may be intermittently unavailable...', time: 'Yesterday' },
  { from: 'Marcus Chen', subject: 'Agenda for Thursday sync', preview: '1) Status of deliverables 2) Risks and blockers 3) Resourcing for next sprint...', time: 'Yesterday' },
  { from: 'HR Benefits', subject: 'Open enrollment closes in 5 days', preview: 'Please review your elections in the benefits portal. If no changes are made...', time: 'Mon' },
  { from: 'Priya Natarajan', subject: 'Slides for client review (v7 FINAL)', preview: 'Attached is the latest version incorporating legal feedback on slides 12–15...', time: 'Mon' },
];
