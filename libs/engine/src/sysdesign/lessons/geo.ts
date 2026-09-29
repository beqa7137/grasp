import type { SdLesson } from './types.js';

export const GEO_LESSON: SdLesson = {
  why: 'Yelp, Uber, Tinder and every delivery app answer the same question thousands of times a second: what is within 2 km of this point, nearest first. An ordinary index sorts one value, so it cannot answer a question about two dimensions and a circle without scanning far too much. Interviewers probe whether you can turn a location into something an index can search (geohash, quadtree, S2 or H3 cells), pick a cell size for the radius, filter by true distance, and handle dense cities and drivers that move every few seconds.',
  widget: {
    kind: 'geohash',
    tryThis: [
      'Keep the defaults: precision 6 at 45 degrees gives cells 865 m wide and 611 m tall. The 4 km square around the 2 km circle touches 6 columns and 8 rows, 48 cells holding 1,269 places, and 628 of them (π × 2² × 50) are within 2 km, so about half the reads are wasted. Drop to precision 5: cells of 3.46 by 4.89 km, only 6 cells, but 5,077 places read and 88% wasted. Precision 4 reads 108,302 places to return the same 628. Now go up: precision 7 reads 1,092 cells and 902 places (30% wasted), and precision 8 needs 31,650 cells to save another 85 places. Waste never falls below about 21%, because the square has 4/π times the area of the circle.',
      'At precision 6, set the radius to 0.5 km: 9 cells, 238 places read, 39 within the radius, 83% wasted, since the cells are now as big as the circle. Precision 7 reads 88 cells and 73 places. Now set 20 km: precision 6 needs 3,216 cells, precision 5 needs 130 cells and wastes 43%, and precision 4 needs 12 cells but wastes 81%. The right precision depends on the radius. Many real systems, Redis geo search among them, use the finest cell size that is at least the radius and read the center cell plus its 8 neighbors: for 2 km at 45 degrees that is precision 5 here, 9 cells and about 7,600 places, more reads than the 6 cells here but a small, fixed set of at most 9 lookups.',
      'Back at the defaults, switch the latitude to the Equator: cells are 1.22 km wide and still 611 m tall, 40 cells and 1,496 places read, 58% wasted. At 60 degrees they are 611 m square, 64 cells and 1,197 places. Cell height never changes, but width shrinks with the cosine of the latitude, half at 60 degrees. At precision 5 the Equator cell is 4.89 km square and 60 degrees makes it 2.45 km wide, still at least 2 km; north of about 66 degrees it is narrower than 2 km, and a 9-cell search at precision 5 would miss places within the radius.',
    ],
  },
  concepts: [
    {
      title: 'Why an index on latitude and longitude fails',
      body: 'A B-tree sorts by one key. An index on (lat, lon) turns "within 2 km" into a latitude range, a band about 4 km tall that circles the whole globe, and only filters longitude inside it: at 40 degrees north that band covers about 123,000 km², ten thousand times the 12.6 km² circle. Two separate indexes do no better, since each band is huge and intersecting them still reads both. The fix is to map two dimensions onto one sortable key so that nearby points get nearby keys (geohash, S2 cell ids), or to use a tree built for two dimensions (quadtree, R-tree).',
    },
    {
      title: 'Geohash: interleaved bits in base 32',
      body: 'Geohash halves the longitude range and records a bit (0 for the lower half, 1 for the upper), then does the same for latitude, and alternates, so the bits interleave longitude and latitude, starting with longitude. Every 5 bits become one character from a base-32 alphabet (digits and letters without a, i, l and o). Each character shrinks the cell by 32, alternately 8 by 4 and 4 by 8. A shared prefix means the same enclosing cell, so "all places in this cell" is a prefix search, which an ordinary B-tree or a sorted set answers as one range scan. At the Equator precision 4 is 39.1 by 19.5 km, 5 is 4.9 by 4.9 km, 6 is 1.2 km by 610 m, 7 is 153 by 153 m, and 8 is 38 by 19 m; widths shrink with the cosine of the latitude.',
    },
    {
      title: 'Neighbors, edges and the poles',
      body: 'Nearby points usually share a long prefix, but not always. The bits follow a Z-shaped curve, so two points a meter apart on either side of a cell edge can differ early: around latitude 0 and longitude 0, the four quadrants start with s, e, 7 and k. A search must therefore read the neighbor cells, never only the one containing the user. Neighbors are computed by decoding the cell, stepping one cell north, south, east or west, and encoding again, with longitude wrapping at 180 degrees. Near the poles cells become thin slivers, a circle can span every longitude, and there is no cell beyond the pole, so polar queries need special handling or a sphere-based scheme such as S2.',
    },
    {
      title: 'Pick a precision, then filter by true distance',
      body: 'Cells only narrow the search to candidates; every candidate is then checked against the real distance and sorted. Two common strategies: take the finest precision whose cell is at least the radius and read those 9 cells (one fixed set of lookups), or cover the circle with more, smaller cells (fewer wasted reads, more lookups, though cells adjacent in geohash order merge into one range). Distance on a sphere is the haversine formula: with R = 6,371 km, d = 2R × asin(sqrt(sin²(Δφ/2) + cos φ1 × cos φ2 × sin²(Δλ/2))). It is within about 0.5% of the true distance on the Earth. For a few km, an equirectangular approximation (scale Δλ by the cosine of the latitude, then Pythagoras) is cheaper and close enough. Never compare raw degrees: one degree of longitude is 111 km at the Equator and 56 km at 60 degrees.',
    },
    {
      title: 'Quadtrees adapt to density',
      body: 'A fixed geohash precision is too coarse in Manhattan and too fine in the desert. A quadtree starts with one node for the whole map and splits any node holding more than a set number of places (say 100) into four quadrants, recursively. Dense areas get deep, small leaves and empty areas stay as large leaves, so each leaf holds a similar number of places. A query descends to the leaf containing the point and reads it and its neighbors, expanding outward until it has enough results. For points that change rarely, such as businesses, the tree is built in memory on every search server and rebuilt or patched as places change. It suits fast-moving points less well, since every move can split or merge leaves.',
    },
    {
      title: 'S2, H3, R-trees and PostGIS',
      body: "Google's S2 projects the sphere onto the six faces of a cube and orders the cells on each face along a Hilbert curve, giving 64-bit cell ids over 31 levels down to about 1 cm². Cells at one level differ in area by at most about 2 times anywhere, including the poles, consecutive ids are neighbors in space, and a region coverer covers a circle or polygon with a few cells of mixed sizes; MongoDB's 2dsphere index uses it. Uber's H3 tiles the Earth with hexagons at 16 resolutions; a hexagon's six neighbors all share an edge and sit at the same distance from its center, unlike a square's diagonal neighbors, which makes rings, smoothing and surge maps simpler. R-trees group nearby objects under bounding rectangles in a balanced tree and index shapes as well as points: PostGIS builds them with GiST, `ST_DWithin` finds everything within a distance, and `ORDER BY geom <-> point` returns nearest first.",
    },
    {
      title: 'Sharding by region and moving objects',
      body: 'A nearby query should touch one shard, so shard by region (a city, or a geohash or S2 prefix), not by place id, which would scatter every query to every shard. Regions are uneven: one shard for Manhattan and one for Wyoming is badly skewed, so split hot regions into finer cells and add read replicas; a query near a shard edge reads both shards. Moving objects are a different workload: a driver sends a location every few seconds, so 1 million drivers make hundreds of thousands of writes a second, each obsolete moments later. Keep them in memory (Redis geo sets or a custom service), move a driver between cell buckets only when the cell changes, expire drivers that stop reporting, and stream updates to a log for history instead of writing each one to the primary database.',
    },
  ],
  examples: [
    {
      title: 'Nearby restaurants for a Yelp-like app',
      problem:
        'An app holds 50 million places and serves 10,000 searches a second at peak: "restaurants within 2 km, nearest 20 first". Assume a city at 40 degrees north with 200 places per km². How do you index the places, and how much does each search read?',
      insight:
        'Turn each location into a geohash so a nearby search becomes a few range scans, read the cells around the circle, then filter and sort the candidates by haversine distance.',
      steps: [
        'An index on (lat, lon) reads the whole latitude band: 4 km tall and 40,075 × cos 40, about 30,700 km, long, about 123,000 km², which runs across North America, Europe and Asia. The circle is only π × 2², 12.6 km², holding about 2,513 places at 200 per km².',
        'Store a geohash per place in an indexed column. The 9-cell strategy needs cells at least 2 km on each side: precision 5 is 4.89 km tall and 4.89 × cos 40, about 3.75 km, wide at 40 degrees. Nine cells cover 165 km², about 33,000 candidates for 2,513 matches, 92% wasted.',
        'Covering the circle with precision 6 cells instead (937 by 611 m here), the 4 km square touches 6 columns by 8 rows, 48 cells: 27.5 km², about 5,500 candidates, 54% wasted. The 48 lookups collapse into far fewer range scans, since cells next to each other in geohash order form one range.',
        'Compute the haversine distance for the 5,500 candidates, keep those within 2 km, and take the nearest 20 with a heap. At about 100 ns per distance that is roughly half a millisecond of CPU.',
        'At 10,000 searches a second that is 55 million candidate rows a second, too many for a disk-based database. Keep an in-memory copy per search server instead: id, latitude, longitude and geohash are about 32 bytes, so 50 million places take 1.6 GB, small enough to replicate on every server. Restaurant details come from a cache after the 20 ids are chosen.',
      ],
    },
    {
      title: 'A quadtree for places with uneven density',
      problem:
        'A service indexes 10 million places, from 2,000 per km² in a dense downtown to 1 per km² in the countryside, and answers "the nearest 20". Why does a quadtree with at most 100 places per leaf beat a fixed geohash precision, and what does it cost?',
      insight:
        'Leaves split until each holds about the same number of places, so a search reads a similar amount of data whether it starts downtown or in a field.',
      steps: [
        'With a fixed precision 6 (about 0.57 km² per cell at 40 degrees), a downtown cell holds about 1,150 places, far more than the 20 needed, while a countryside cell holds about 0.6, and the nearest 20 lie within about 2.5 km (π × 2.5² ≈ 20 km²). Covering that 5 km square takes 7 by 10, 70 cells, almost all empty.',
        'In the quadtree, a downtown leaf of 100 places covers about 0.05 km², a square of roughly 220 m, and a countryside leaf covers about 100 km², a 10 km square. The nearest 20 downtown lie within about 56 m, so the leaf and its neighbors, a few hundred places, are enough; in the countryside a handful of leaves is enough too.',
        'Depth follows density: the root covers about 40,000 by 20,000 km measured at the Equator, 8 × 10⁸ km², and each level divides by 4. Reaching 0.05 km² takes about 17 levels (log base 4 of 1.6 × 10¹⁰), and 100 km² about 11 or 12, so every lookup is a couple of dozen pointer hops in memory.',
        'Memory: 10 million places at about 24 bytes (id, latitude, longitude) is 240 MB, plus a few hundred thousand nodes of tens of bytes each. Every search server holds a full copy and they scale out as replicas.',
        "New and closed places arrive at a few per second: update the tree in place (split a leaf that passes 100, merge siblings that fall well below it) or rebuild it nightly from the database and apply the day's changes on top.",
      ],
    },
    {
      title: 'Driver locations for a ride-hailing app',
      problem:
        'A ride-hailing app has 1 million drivers online, each sending a location every 4 seconds. The busiest city has 40,000 online drivers. Three million riders have the app open and refresh the cars on their map every 5 seconds, and 2,000 ride requests a second need the nearest available drivers. Design the location service.',
      insight:
        'Driver locations are small, hot and short-lived: keep them in memory, shard them by city, and serve the rider map from cached per-cell snapshots rather than a fresh query each time.',
      steps: [
        'Writes: 1 million / 4 s is 250,000 updates a second. At about 64 bytes per driver (id, position, heading, status, timestamp) the whole state is only 64 MB, so the hard part is the write rate and the hot cities, not size. Writing each update to the primary database would spend its capacity on rows that are stale in 4 seconds.',
        'Shard by city: the busiest city gets 40,000 / 4, 10,000 updates a second, comfortable for one in-memory shard such as a Redis geo set, where each add costs O(log n). If a city outgrows one shard, split it by geohash prefix and let the few queries at a boundary read two shards.',
        'Index drivers in cells (for example geohash precision 6, or an H3 resolution) and move a driver between cell buckets only when an update crosses a cell edge. Keep a last-seen time and sweep out drivers silent for 30 seconds, since Redis sorted set members have no expiry of their own.',
        'Reads outnumber writes: 3 million riders / 5 s is 600,000 map refreshes a second. Rebuild a snapshot of each non-empty cell every second or two and serve each rider the cells around them from a cache; cars on a map can be a couple of seconds old.',
        'Matching is different: for each of the 2,000 requests a second, query the live cells for available drivers within, say, 3 km, then ask the routing service for driving times to the closest 10 or so. Straight-line distance ignores rivers and one-way streets, so the nearest driver is not always the fastest.',
        'Losing a shard loses nothing that matters: every driver reports again within 4 seconds, so a replacement rebuilds its state almost at once. History, such as trip paths and data for ETA models, goes to a log like Kafka, not to the live index.',
      ],
    },
  ],
  pitfalls: [
    'Reading only the cell that contains the user: a place 10 m away across the cell edge is missed. Read the neighbor cells too, or cover the whole circle.',
    'Treating the length of a shared geohash prefix as a distance: two points a meter apart on either side of the Equator, the prime meridian or any cell edge can share no prefix at all. Filter and sort by computed distance.',
    'Measuring distance in raw degrees: a degree of longitude is 111 km at the Equator and 56 km at 60 degrees, so Euclidean distance on latitude and longitude ranks results wrongly away from the Equator.',
    'Writing every driver location update to the primary database: hundreds of thousands of writes a second of data that is obsolete seconds later. Keep live positions in memory and stream history to a log.',
    'One fixed precision for the whole world: cells that suit a dense downtown are nearly empty elsewhere and force many lookups. Pick the precision from the radius, or use a structure that adapts, such as a quadtree or an S2 covering.',
  ],
  followUps: [
    {
      question: 'How do you answer "the nearest 20" when you do not know the radius in advance?',
      answer:
        'Search in rings: read the cell and its neighbors, and if fewer than 20 candidates lie within the distance those cells are guaranteed to cover, widen the search by one ring of cells or one coarser precision and repeat. Stop when the 20th nearest candidate is closer than the covered distance, since nothing outside can beat it. Quadtrees and R-trees do this natively with a best-first search, as the PostGIS nearest-neighbor operator does.',
    },
    {
      question: 'A delivery app defines its service areas as polygons. How do you find which area contains a customer?',
      answer:
        'Index each polygon by its bounding rectangle in an R-tree, or cover it with S2 or H3 cells kept in a hash map from cell to polygon ids. A lookup finds the few polygons whose rectangle or cell contains the point, then runs an exact point-in-polygon test on each. Cells fully inside a polygon can be marked so most lookups skip the exact test.',
    },
    {
      question: 'Why do Uber and others use hexagons for surge pricing and demand maps?',
      answer:
        "A hexagon's six neighbors all share an edge and lie at the same distance from its center, while a square has four edge neighbors and four corner neighbors about 1.4 times farther away. Rings of hexagons therefore approximate circles well, and smoothing demand over neighbors treats every direction alike. Hexagons do not nest exactly (H3's seven children only approximately cover their parent), a trade accepted for those uniform neighbors.",
    },
  ],
};
