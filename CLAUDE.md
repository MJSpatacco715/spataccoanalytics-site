# spataccoanalytics-site

This repository is the single source for spataccoanalytics.com. Read
"Where everything lives" in `README.md` before changing anything: it maps
every piece (site, scorer, `/score/`, lead endpoint, menu, relay) to where it
lives and says which pieces are not in this repo yet.

## Working rules

- One branch and one open pull request at a time. Before starting, list open
  pull requests and build on or supersede what is there; do not open a
  parallel one for the same pages.
- Merging to `main` publishes (`.github/workflows/publish.yml`). Nothing is
  live until then, so say "merged" and "live" separately.
- Site copy and pages are edited in `site/` only. Never on the host.
- The home page is short on purpose: five screens (buyers and your data,
  prospects and your website, the three pillars, how we work, contact), each
  sending a visitor on to a page of its own. The owner asked for this after
  the page had grown to seven long sections. Long copy goes on `/approach/`,
  `/about/` or `/services/`, not back onto the home page.
  `tests/pages_test.sh` holds the shape, a word limit, that each pillar links
  to a real service, and that every menu reaches every page.
  It is short in height too (the owner again, in November 2026: "main page
  still too scrolley"): from 1080px wide the first screen, the website screen,
  How We Work and the closing band are laid out side by side (copy on the
  left; figures, steps or the button on the right), and no section is padded
  more than it needs. On a phone everything is one vertical stack, section by
  section: nothing sits side by side there. A change that adds a section or a tall block has to take as
  much height out somewhere else.
  It is navy from top to bottom. The three pillars were its one light section;
  the owner, 2026-11-27: "the one home/page scroll that's weirdly all white in a
  sea of blue", and, shown it in navy and asked: "Yes, make it navy". A pillar
  is the site's panel (a faint lift off the navy inside a hairline), and the
  Insights teaser, when a `practice` post puts one on the page, sits on the navy
  too (`.in-home` in `site/css/insights.css`). Do not put a light section on the
  home page. `tests/hero_browser.cjs` looks for one.
- The pages grow with the window. The owner, 2026-11-27, with the site at 100%
  beside the same page zoomed to 150%: "the site looks better at 150% size than
  100%, there should be some adjustment. with a target market of 50-80 year olds
  I shouldn't ask people to squint". Shown three sizes, the owner chose to match
  the 150% view. So every size on the main pages, the scorer and the Insights
  pages is in `rem`, and on a page whose `<html>` carries `class="sa-scale"` the
  root font size follows the window: 16px up to a window 1255px wide (the
  owner's own window at 150%, the size the pages were laid out for, so nothing
  there changed), then in step with the window, so a 1920px screen at 100% shows
  what the owner sees at 150%. It stops at 175%, and follows the window's height
  too. `scripts/scale_css.py` holds the rule and the list of files, rewrites a
  px size as rem, and with `--check` fails on one. Write sizes in rem (px / 16),
  or write px and run it. What stays px: 1px and under, and the widths in
  `@media` conditions. A size a script sets has to be in rem too
  (`site/js/ticker.js` does this for its columns and its speed).
  A page not in that list (each tool's own page) does not carry the mark and is
  drawn as it always was, so it is never left with a big menu over small text.
  Convert its styles, then mark it.
  On a phone no text is under 13px (the owner, asked: "Yes, 13px floor"): a font
  size under 13px is written `max(size, var(--tfloor))`, which the script does.
  The one size let under it is the menu's five links on a phone narrower than
  350px, set smaller so they stay on one row. On the Tools page the taller text
  was paid for out of the gaps, so the strip still closes the first screen.
  `tests/scale_browser.cjs` opens every page at the owner's window and the
  owner's screen and holds that it is the same page enlarged, with nothing left
  at its old size, and on three phones that nothing is under 13px.
  Known and accepted: on a big screen the browser's own zoom between 100% and
  150% changes little, because the page already fills the window.
- A card that opens on hover waits for the pointer to rest. The owner,
  2026-11-27: "the hover cards are very sensitive. if i even glance over it (and
  people are likely to) it is BOOM taking up screen space. Someone should have
  to linger on the link for just a split second for it to pop." The market
  strip's cards open after 300ms on a figure (`LINGER` in `site/js/ticker.js`),
  the statistics' source cards after the same (`transition-delay` in
  `site/css/cite.css`). A click, a tap and the keyboard open one at once, and
  it closes as it always did. `tests/ticker_browser.cjs` and
  `tests/hero_browser.cjs` pass a pointer over one (nothing opens) and rest on
  one (it opens).
- The menu reads Services, Approach, Tools, About, Contact, on every page, in
  the posts' shell (`scripts/build_insights.py`) and so on every tool page. The
  owner set that order on 2026-11-26. `tests/pages_test.sh` holds it.
- Headlines. The blue part of a headline is the last thing in it and sits on a
  line of its own, on every page (the owner, 2026-11-26: "as a standard I'd
  like the blue response hero text to be on its own line"). The shared
  stylesheet does it for the inner pages (`.page-hero h1 em`), the home page
  for its own two. There is no exception now. The Tools page's headline was one
  sentence kept on one line ("this one is okay to stay") until the owner asked,
  the same day, for it to put the question ("frame it more of your website can
  do more..... what can/should your website do for you?") and chose, of four:
  "Your website can do more than describe you." in white and "What should it do
  for you?" in blue on its own line.
- Every inner page opens on at least one supporting figure with its source
  (the owner, 2026-11-26: "They should all have at least one supporting
  statistic"), in the same form on each (`.hero-stat` in the shared stylesheet,
  with a source card): Services 62% (Broadridge), Approach 56% (Morningstar),
  About 244 RIA deals (DeVoe & Company), Contact 3% (Orion), Tools 72%
  (Wealthtender). The owner approved these five. Four are the home page's own
  figures and must say what the home page says of them; the About figure is
  the market strip's deal count and changes with it each quarter
  (`docs/stat-bank.md`). On the Services and Tools pages a phone shows the
  figure after the services and the tiles, which keep the first screen.
  The line that closes How We Work, on the home page and on the Approach page,
  is the owner's (2026-11-27): "Adoption shouldn't be a battle. It should be a
  non-event." It had read "Adoption isn't a fight. It's a non-event."
  A claim with a number or a "most" in it needs a source or it goes. The
  Approach page said "Adoption dies in week three", which came over with the
  first site's copy and had no source (the owner: "how do i know that? how do
  they know that's true?"). It now reads "A cleanup built on someone else's
  workflow does not stick. We build on the way your team already works.", the
  owner's choice of three.
- The Tools page opens on its tools (the owner, 2026-11-26: "on the tools page
  the meat is too buried. I need tiles or chips that fit with the overall
  scheme to pull to the top (visible on first glance) the tools that meet the
  criteria. Sports Movies Business, etc"). The first cut had five kinds and all
  thirteen tools on the first screen; the owner, the same afternoon, of that on
  a phone: "This is too many categories/tiles/chips And I want the scroll to
  show bottom of first visible screen". So its first section holds three kinds
  (Business, Sports, Movies) and the tiles of the kind chosen only, Business to
  begin with. Every tool is of exactly one kind; a platform that runs privately
  is filed with what it is for (the CRM under Business, the league platform and
  the golf pick'em under Sports). Do not add a fourth kind or an "All".
  A tile goes to its tool, or, for a platform that runs privately, to where it
  is described lower down. A tool added to the page needs a tile, and a tile
  needs its tool: `tests/pages_test.sh` fails until they match.
  A tile says what it is. The owner, 2026-11-27, of the Business tools on a
  phone: "RIA digital presence scorecard and Resume parser should be
  bigger/stand alone there as interactive tools or named as interactive versus
  merely descriptive". So a tool a visitor can use now (`tl-live`) has a filled
  badge and says "Interactive: try it now", and a platform described lower down
  (`tl-see`) is quieter and says "Built to order". Which one a tile is follows
  from where it leads (`#built-...` is described), and in each kind the tools to
  use come first. Where the kind chosen has four tools or fewer (Business,
  Movies) the tiles are large and the words show, the tools to use the larger;
  a longer list (Sports) keeps the small tiles, told apart by the badge. On a
  phone too short for the large tiles they fall back to the small ones.
  Icons are drawn, not emoji (the owner, the same message: "Icons could be MUCH
  better"): thirteen symbols at the top of `site/tools/index.html`, one a tool,
  used by its tile and by its card lower down. A card the build adds takes its
  icon from `CARD_ICONS` in `scripts/build_site.py`. No emoji stands in for an
  icon on that page.
  That section is as tall as the first screen less the market strip, which comes
  next in the page, so the strip lies along the bottom of the first screen, all
  of it showing (`min-height` in `svh`, the screen as a phone shows it with its
  own bars up; the 2.125rem and 2rem there are the strip's heights, 34px and 32px
  as drawn, and change with them). What the section holds is centred in it, and held where it stands once
  a visitor touches it, so choosing a kind does not move the row just pressed.
  `tests/hero_browser.cjs` opens it at the owner's window (1255 by 607), the
  owner's phone (430 by 744) and the commonest phone (390 by 664); a phone that
  shows less height gets the same screen set tighter (two rules by
  `max-height`), and on the smallest the eight Sports tiles push the strip just
  under. The rules for that section are scoped to it
  (`.tl-hero`), because each tool's own page is built with the same head.
- The Services page opens on its services (the owner, the same day: "services
  page is all talk and no service options on first screen"). The four sit in
  the first section, beside the headline from 1000px wide and under it on a
  phone, each going to its own part of the page, and all four are on the first
  screen at the owner's own window (1255 by 607: a 1880px screen at 150%) and
  on a phone. Nothing goes between the menu and them, and the headline there
  stays the size it is. Its blue line is "Pick where to start.": the owner did
  not love "Scoped before you commit." and chose this one. What each option
  says beside its name (free, weeks, the hosting price) is read off the page's
  own parts by `tests/pages_test.sh`; `tests/hero_browser.cjs` opens it in a
  browser. A block of links inside a page is a `div`, never a `nav`: the
  shared stylesheet pins every `nav` to the top of the window.
  The audit's free level, Website Score, is the website scorer, and it is not a
  level to choose. It was a radio like the levels beside it, and a tap only
  ticked it; the owner, 2026-11-26: "This should (obviously) link to the web
  scorer". Anything on the site that offers the free score goes to the scorer.
  Its card has two ways, the owner's choice of three ("Maybe an option to
  add/bundle with other services or other option to go to the scorer"): "Score
  my site" is a link whose own edge is laid over the whole card, so a tap
  anywhere opens the scorer, and "Bundle with other services" is a button above
  that edge which puts the score in the plan, or takes it out. A button is
  never put inside a link: that is why the card is a `div` and the link is
  stretched.
  With a project level picked (an audit, a design or a CRM level) it is in the
  plan by itself (the owner: "Add it to the builder. Essentially will be
  auto-checked on all paid engagements"): the card shows ticked, the plan lists
  it first as included and free, and its button only says "Included in your
  plan". A hosting plan alone does not bring it in: asked whether hosting
  counts, the owner answered "Project work only". Its card says it comes with
  every project.
- The logo. The owner, 2026-11-26: "the logo is small and near invisible on the
  site". The menu had shown the logo file whole (`site/img/logo.jpg`: the
  wordmark small in the middle of a white square), 36px tall, which left the
  name about 8px tall. Shown four fixes and asked which, the owner answered "A
  with C where appropriate". So: the menu on every page shows the wordmark
  alone, cut out of its square, lettering white (`site/img/wordmark-on-dark.png`,
  made by `scripts/logo_cutout.py`), 48px tall on a desktop as drawn (3rem: it
  grows with the page) and never under 36px; and both logos together, the SA mark on its white tile and then the
  wordmark, go where there is room for both, which is the footer. The two are
  not put side by side in the menu, and `logo.jpg` is never shown directly on a
  dark page. The SA mark (`site/img/logo-square.png`) stays the picture for the
  browser tab, search and profiles. `tests/pages_test.sh` and
  `tests/logo_browser.cjs` hold all of it.
  The wordmark's tags and the `shared.css` link carry `?v=` and the first eight
  characters of the file's SHA-1, because the host keeps both for a year: change
  `site/css/shared.css` and the link on every page (and in
  `scripts/build_insights.py`) must change with it. `scripts/asset_versions.py`
  writes the current version into every tag for the five shared files
  (`shared.css`, `cite.css`, `insights.css`, `ticker.css`, `ticker.js`): run it
  after changing one. `cite.css` and `insights.css` had no version at all until
  November 2026. `tests/pages_test.sh` runs its `--check`.
  Off the site the wordmark leads too (the owner, the same day: "can i make
  sure the new logo is front and center for linkedin / google search, etc?"):
  the share picture every page names (`site/img/social-card.png`, with a `?v=`),
  and the LinkedIn banner and Google cover in `brand/profile/`, all drawn by
  `scripts/brand_images.cjs`. Three places stay the SA mark because they are
  small squares where the wordmark cannot be read: the browser-tab icon, the
  logo search engines are given in the home page's structured data (Google
  asks that it look right on white, where white lettering would vanish), and a profile
  picture unless the owner chooses the wordmark square. The profiles are the
  owner's accounts: the files are made here, the owner uploads them.
- Pages are never kept by the host's page cache (`site/.htaccess` marks
  every `.html` file `private, no-cache`), so a publish shows without anyone
  clearing a cache. Scripts, styles and images are kept for a year: when one
  changes, its address must change (a `?v=`), or returning visitors never get
  it.
  The site is behind Cloudflare, which keeps a script, style or image for that
  year under its full address, `?v=` included, at each of its locations. So a
  new address must never be asked for before the publish that brings the file
  has finished: asked early, Cloudflare is handed the old file and serves it
  under the new address from then on. On 2026-11-26 a check of
  `ticker.css?v=...` made a minute before the publish landed left the Newark
  location serving the old stylesheet, and the owner saw the strip unpinned
  ("ticker not sticking to the right place"). To check a publish: read the
  page, which is never kept, until it names the new address, and only then
  fetch the file and compare its SHA-1 with the tag, several times so that more
  than one location answers. A count of some word in the file proves nothing.
  If a wrong copy is kept anyway, change the file so its address changes; the
  owner can also purge that address in Cloudflare.
  A visitor cannot cause it either: the publish unpacks everything a page
  loads first and the pages last (`scripts/remote_deploy.sh`,
  `tests/remote_deploy_test.sh`), so no page names an address before its file
  is there. Keep that order.
- No em dashes in anything written to the site, the docs or commit messages.
- Private names stay private: the denylist in `config/hosting.json` applies
  to every built file.
- Project prices never go in this repository: not in a page, a test, a
  commit message or a pull request. The repository is public. They live in
  the `SERVICE_PRICING` secret only. Hosting prices are public and are in
  `site/services/index.html`.
- How much of the project pricing is locked. The owner, 2026-11-26: "i want
  some lock on pricing but it does currently seem/feel too locked / not
  informative enough. Maybe each visitor gets one unveil (click to unveil) and
  then the second click brings about a contact form (with the two things
  they've checked (and an option to add others)) and they input email there".
  So each project price on `/services/` is a "Click to unveil" button. The
  first click shows that one price, with no email, and puts its level in the
  plan; `site/services/pricing.php` remembers it in an HttpOnly cookie for 30
  days and gives an address at most two different prices a day. That is a
  soft limit, said so in the code: it stops a script, not a person on a second
  connection. Any later click opens the pricing form with the price seen and
  the one clicked ticked, every other priced item under "Add other services",
  then name, email and firm. The email brings every project price onto the
  page, and the notice lists each service ticked by name and the one seen
  first. `tests/pricing_test.sh` and `tests/notice_test.sh` hold it.
- Every statistic on the site carries its source: the publisher and year in
  view, and a source card (`site/css/cite.css`, `site/js/cite.js`) with the
  finding, who was surveyed and a link. A number with no checkable source
  does not go on the site.
- A post is a file in `content/posts/` (format at the top of
  `scripts/build_insights.py`). The site is where a piece is published;
  LinkedIn gets its words from `build_insights.py --linkedin SLUG` and a
  link back. Only the `practice` category appears on the homepage.
- The weekly statistic follows `docs/stat-bank.md`: the next item from the
  private stat bank (`/bank/`), traced to its real source, drawn as a card
  (`scripts/stat_card.cjs`) and written as a post. Nothing from the bank is
  published, on the site or anywhere else, until the owner says so. What is
  in the bank is private: never copy an item, a file or the bank's password
  or token into this repository, a commit or a pull request.
- The market strip is on the tools page. The owner moved it there from the
  home page on 2026-11-26 ("i want the ticker to be on the tools page instead
  of the home page"), and the same day set its place: "lets have the copy lead
  and have the scroll between tools & projects and financial services section.
  when user scrolls down on the tools page the ticker should go with them and
  stay up top pinned to menu". So the opening copy comes first, the strip sits
  between it and the Financial Services section, and once the page is scrolled
  past it the strip stays pinned under the menu (`position: sticky`, its top
  set to the menu's height by `site/js/ticker.js`). The home page does not
  carry it. In `site/tools/index.html` it is the page's own child, between
  those two sections, never inside one: inside a section it would stop being
  pinned when that section scrolled away, and its cards would be cut off. Its
  stylesheet and script tags sit beside it, not in the head or after the
  footer, because the build reuses that page's head, menu and footer for each
  tool's own page.
  A card always shows whole. Pinned, it opens below the strip. At the start,
  where the strip lies along the bottom of the first screen, it opens above it,
  and where there is not the height for that (the owner's own window, 607px
  tall) it is laid out wide, in two halves side by side (`wide()` and `under()`
  in `site/js/ticker.js`). A change to a card's contents has to be checked at
  the start position as well as pinned.
  The strip (`site/js/ticker.js`, `site/market/feed.php`,
  `site/lib/market.php`) shows only figures the site may show: each comes
  from its publisher's own free feed and says in view who published it and
  for when. The S&P 500, the Dow and gold are licensed data. They do not go
  on the strip from a free or scraped feed: only from a source the owner has
  a licence for. The energy key is the `EIA_API_KEY` secret and is never in
  this repository.
  Brent and WTI are not the energy publisher's own figures: it buys them from
  Refinitiv and republishes them with permission. The owner was told this and
  ruled on 2026-11-25 to keep both on the strip, so do not take them off or
  raise it again. Its weekly gasoline price is its own survey.
  The RIA deal count on it is DeVoe & Company's, typed into `MARKET_DEALS`
  each quarter
  (`docs/stat-bank.md`). Every card is drawn, not written out. The deal
  count: the count, a bar toward the record, and the year beside the record
  year quarter by quarter, all from numbers in that same place. A market
  figure: its value and change, a line of its recent history, the low, the
  high and the change. The history comes from the same publisher's feed as
  the figure and is kept with it; a chart needs five days of it. The energy figures are asked for
  hourly, because their publisher releases the daily oil prices once a week.
  Its hover cards name the source with a link and end on the owner's line:
  "This tool runs entirely on free public data. Yours could too." That is as
  far as the hover sells: no link and no direct pitch. The owner wants the
  question ("why don't you have tools like this working for you") asked where
  the strip is referenced elsewhere on the site. The host keeps scripts
  and styles for a year, so the strip's two tags in `site/tools/index.html` carry
  `?v=` and the first eight characters of each file's SHA-1.
  `tests/market_test.sh` fails until they match.
- Search: a page's title says what the page sells or does, not its menu name
  ("Services" alone told a search engine nothing). Every page in the sitemap
  has a description of 80 to 160 characters and is not `noindex`; a delisted or
  private page is `noindex` and not in the sitemap. After a merge, the publish
  sends the pages that merge changed to IndexNow (`scripts/indexnow.py`), for
  Bing. Its key is the 32-character `.txt` file in `site/`, public by design:
  do not treat it as a secret or delete it. Google is reached through Search
  Console and the sitemap, which only the owner's account can do.
- Printed material points at `/score/`, never at the scorer's own address.
  If the scorer moves, change `site/score/index.html`, not the print.
- The scorer wears the site's own look. The owner, 2026-11-27: "scorer has a
  bland SA logo and all white screen (like the one home/page scroll that's
  weirdly all white in a sea of blue). it contrasts with the style and feel of
  the site overall and feels imported, rather than in house. match the visual
  style of the scorer to the overall site". So `site/tools/website-scorer.html`
  uses the shared stylesheet, the site's menu (Tools lit) and footer, its navy
  ground, its two typefaces and its cyan-to-purple buttons, and opens on the
  site's page hero with the blue line of the headline on a line of its own.
  Its own styles are only what no other page has (the form, the matches, the
  results), drawn as the site draws a panel: a faint lift off the navy inside a
  hairline. Nothing on it is a light panel, and nothing is dark words on the
  dark ground: `tests/scorer_browser.cjs` looks, in each state (as it opens, the
  matches, the score, the full breakdown), on a desktop and a phone.
  Its opening says how the hundred points are made up, the hundred first and
  the three under it (the owner, 2026-11-27: "this 100 breakdown should have 100
  at the top and trickle down to the breakdown 50 / 30 / 20 with a look more
  like the logo"). The figures hang off traces drawn the way the logo draws its
  own: a hexagon at the hundred, 45 degree elbows, round ends, cyan to blue to
  purple. There are two drawings of the one thing, both inline SVG with every
  measure in rem: from 1000px the three stand one under another beside the
  headline (`.sc-trace.v`), and under it they stand side by side beneath the
  hundred (`.sc-trace.h`), which keeps the opening short on a phone. Change a
  row's height or a column's width and the drawing's paths must change with it:
  `tests/scorer_browser.cjs` holds that each trace ends at its figure.
  Each of the three is a button, and what it is made of opens on a card (the
  owner, the same day: "if there is a more granular underpinning to the
  components I wouldn't mind them being shown on a hover (without giving the
  secret sauce away)"): the category names and their points, filled by the
  script from `WEBSITE_CATS` and `LINKEDIN_CAT`, so the card and the scoring
  cannot differ. Names and points only: how each is judged is not said on the
  card. From 1000px the card stands to the left of the breakdown once the
  pointer has rested 300ms, and a click or a key opens it at once; under 1000px
  it opens in place on a tap. The opening clips what leaves it, so the card is
  placed inside it.
  Its five ratings are the owner's names (2026-11-27: "I don't love the category
  titles Distinction ...Poor"): Excellent (85 and up), Strong (70), Adequate
  (55), Needs Work (40), Red Flags and Violations (under 40). `getTier`, the
  legend over the form and the PDF say the same five, and the servers keep forty
  characters of a rating so the longest is whole on the record, in the notice
  and in the CRM.
  Its marks are drawn: a globe for a website and LinkedIn's own mark, in
  LinkedIn's blue with white letters, wherever LinkedIn is named with a mark
  (the owner: "use the Linkedin Logo on the page where appropriate instead of a
  briefcase"). No emoji stands in for an icon on the form.
  The PDF scorecard is paper and keeps its paper colours: `getTier` and
  `getScoreColor` give those, and `lit()` and `wash()` turn them into what is
  drawn on the page. Change a colour for the page there, not in `getTier`.
  The menu is fixed to the top of the window, so anything the page scrolls to
  carries `scroll-margin-top`.
- A field for a web address takes what people type. The owner, after the scorer
  turned away `www.` and a domain with no `https://`: "This cannot require https
  etc. too rigid". `tidyAddress` in `site/tools/website-scorer.html` makes a
  typed address whole, and `lead_url` in `site/lib/leads.php` reads it the same
  way. No field asks for `https://`, in its hint or in its message.
- A firm's name typed into the scorer is looked up, not turned away. The owner,
  2026-11-26: "Can we soften the website score input matching a bit? If i type
  a firm name (and not website (not https not even www)) could it offer user
  option of 'is this the right one?' With logic (and shown/listed confidence
  per card shown)". Asked where the matches should come from, the owner chose
  the search the scorer already runs. So what is typed and is not an address
  goes to the relay as a fifth request (`find`: three searches at most, counted
  against its own `LOOKUPS_PER_DAY`, so finding a firm does not use up a
  score), and the page shows up to three firms, each with its own site, its
  place, how sure the search is (a word, a number and a bar) and why, with
  "Yes, score this site" and a way out. Nothing is scored until one is chosen,
  one match is still asked about and never assumed, and a directory or a social
  page is never offered as a firm's site. What the search wrote is shown as
  text, never as markup. When the lookup cannot run (the relay not pasted in
  yet, a daily limit) the visitor is asked for the address instead.
  The whole of it works from the keyboard. The owner, 2026-11-27: "when i type
  a firm in and hit enter nothing happens. I shouldn't ask people to click
  confirm with mouse if they prefer keyboard entry". Enter in the website or
  the LinkedIn field does what the Analyze button does, and when the matches
  come the likeliest one's button has the keyboard, so Enter again scores it.
  While it looks, the line says that choices come next (the owner, the same
  day: "looking for ... and will give you options to choose from"), so nobody
  waits thinking a score has started on a guess.
  `tests/scorer_browser.cjs` opens it with the relay stood in for: no test runs
  a real lookup or a real score.
- The scorer keeps the owner a record of what goes into it. The owner,
  2026-11-27: "the scorer should also keep a record for me and only me to see
  what has gone into the mechanism. This should feed into the Taccobox CRM in
  some fashion as well, that will be the best/main spot for the leads and flow
  that comes through the system. Though I absolutely want to maintain getting
  an email when someone hits the button(s)". So the page tells
  `site/score/run.php` each step (a firm's name looked up and the firms
  offered, the one chosen or none of them, a score that finished or did not),
  and each is a line in `sa-leads/scorer-runs.jsonl`, off the web, beside the
  leads. Steps that share a `run` are one visit to the form, and the lead left
  afterwards carries the same run. No address of the visitor's is written down.
  The record never holds a visitor up and never shows: if it cannot be kept,
  the scorer does everything it did.
  Which presses mail the owner (asked, of four: "Each score + each unlock"): a
  finished score mails a notice with what was typed, the site scored and the
  score, and the lead's own notice follows when a name and email are left. A
  score from a visitor already known sends only the lead's notice, which says
  both. Score notices stop at sixty a day, everyone together; the record is
  still kept.
  It reaches the CRM through `site/score/feed.php`, which answers only to the
  token in the `SCORER_FEED_TOKEN` secret (written beside the web root by the
  publish, never in this repository) and is not there at all until the secret
  is set. In the CRM it lands in an inbox the owner approves from (asked:
  "Scorer inbox to approve"): nothing becomes a firm or a person there until
  the owner accepts it. The CRM is another repository with rules of its own.
  `tests/run_test.sh` holds the record, the notice and the feed;
  `tests/scorer_browser.cjs` holds what the page tells it.
- The scorer and the resume parser talk to the `ria-scorer` Cloudflare
  Worker. Its source is `worker/ria-scorer.js`, and it refuses any request
  it does not recognise. Change a tool's instructions, reader, tools or
  sizes and the relay must change with it: `tests/worker_test.mjs` fails
  until it does. The Worker is deployed by hand (`worker/README.md`), so a
  relay change is not live until the owner has pasted it in. Say so.

## Checks before a push

```
python3 scripts/validate_showcase.py showcase/tools.json
python3 scripts/scale_css.py --check
python3 scripts/asset_versions.py --check
python3 scripts/build_site.py --site site --out dist
bash tests/remote_deploy_test.sh
bash tests/feed_test.sh
bash tests/lead_test.sh
bash tests/run_test.sh
bash tests/contact_test.sh
bash tests/notice_test.sh
bash tests/bank_test.sh
bash tests/card_test.sh
bash tests/market_test.sh
bash tests/pages_test.sh
bash tests/pricing_test.sh
node tests/worker_test.mjs
bash tests/insights_test.sh
for f in site/score/lead.php site/score/run.php site/score/feed.php site/contact/submit.php site/lib/leads.php site/services/pricing.php site/bank/api.php site/lib/bank.php site/market/feed.php site/lib/market.php; do php -l "$f"; done
```
