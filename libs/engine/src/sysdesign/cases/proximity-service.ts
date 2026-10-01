import { CELL_SEARCH, EDGE_KM, cellPlaces, cellSearch, kmText, radiusText, sharedPrefix } from './proximity/cells.js';
import { EARTH_RADIUS_KM, geohashBounds, geohashCellKm, geohashEncode, haversineKm } from './proximity/geohash.js';
import { QUADTREE, bytesText, quadtree, quadtreeQueries } from './proximity/quadtree.js';
import type { CaseStudy } from './types.js';
import { num } from './widget-checkpoint.js';

const BUSINESSES = 200_000_000;
const DAILY_USERS = 100_000_000;
const SEARCHES_A_USER = 5;
const PEAK = 3;
const RECORD_KB = 1;
const REPLICAS = 3;
/** Share of businesses edited on a given day. */
const EDITED_A_DAY = 0.01;
const LATENCY_MS = 100;
const NEAREST = QUADTREE.nearest;
const BAND_RADIUS_KM = 2;
const SMALL_RADIUS_KM = 0.5;
const POLE_LAT = 89;

const searchesADay = DAILY_USERS * SEARCHES_A_USER;
const averageRps = searchesADay / 86_400;
const peakRps = Math.round(averageRps * PEAK);
const recordsGb = (BUSINESSES * RECORD_KB * 1000) / 1e9;
const indexGb = (BUSINESSES * QUADTREE.entryBytes) / 1e9;
const editsADay = BUSINESSES * EDITED_A_DAY;
const peakEdits = Math.round((editsADay / 86_400) * PEAK);
const peakReads = 2 * peakRps;
const labRps = Math.round((peakReads + peakEdits) / 100) * 100;
const readShare = Math.floor((peakReads / (peakReads + peakEdits)) * 1000) / 10;
const trillions = Number(((peakRps * BUSINESSES) / 1e12).toFixed(1));

const { user, across } = CELL_SEARCH;
const lat = user.lat;
const latText = `${Number(lat.toFixed(2))}° N`;
const bandKm2 = 2 * BAND_RADIUS_KM * 2 * Math.PI * EARTH_RADIUS_KM * Math.cos((lat * Math.PI) / 180);
const circleKm2 = Math.PI * BAND_RADIUS_KM ** 2;
const size = (precision: number, at: number = lat) => {
  const { widthKm, heightKm } = geohashCellKm(precision, at);
  return `${kmText(widthKm)} by ${kmText(heightKm)}`;
};
const userCell = geohashEncode(user.lat, user.lon, 6);
const acrossCell = geohashEncode(across.lat, across.lon, 6);
const acrossKm = cellPlaces()[0].km;
const corner = geohashBounds(userCell);
const cornerKm = Math.max(
  ...[corner.south, corner.north].flatMap((y) => [corner.west, corner.east].map((x) => haversineKm(user.lat, user.lon, y, x))),
);
const own = cellSearch({ precision: 6, radiusKm: SMALL_RADIUS_KM, scope: 'own' });
const nine = cellSearch({ precision: 6, radiusKm: SMALL_RADIUS_KM, scope: 'neighbours' });
const wide = cellSearch({ precision: 6, radiusKm: 1, scope: 'neighbours' });
const coarse = cellSearch({ precision: 5, radiusKm: 1, scope: 'neighbours' });
const p6 = geohashCellKm(6, lat);
const p8 = geohashCellKm(8, lat);
const fineCells = (Math.PI * SMALL_RADIUS_KM ** 2) / (p8.widthKm * p8.heightKm);
const tree = { ...quadtree({ capacity: 100, density: 'city' }), ...quadtreeQueries({ capacity: 100, density: 'city' }) };
const tiny = { ...quadtree({ capacity: 5, density: 'city' }), ...quadtreeQueries({ capacity: 5, density: 'city' }) };
const averageDepth = tree.buildSteps / QUADTREE.places;
const scaledDepth = averageDepth + Math.log(BUSINESSES / QUADTREE.places) / Math.log(4);
const lonShrink = Math.round((1 - Math.cos((lat * Math.PI) / 180)) * 100);

export const PROXIMITY_SERVICE: CaseStudy = {
  id: 'proximity-service',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what must be fresh',
      prompt: `A consumer app like Yelp: people open it and see restaurants, shops and other places near them. ${num(BUSINESSES / 1e6)} million businesses worldwide, about ${num(DAILY_USERS / 1e6)} million daily users. Searches vastly outnumber edits. Before choosing an index, decide how fresh search must be.`,
      decision: {
        question: 'A business owner changes their address or opening hours. How soon must each part of the app show it?',
        options: [
          {
            label:
              'The business page shows the edit as soon as it is saved; search may take up to a day to reflect it, so the location index can be built offline and served from memory',
            best: true,
            why: 'The owner checks their own page, which is read by id from the business store, so they see the change at once. Searchers rarely notice that a change took a few hours to reach search, and a relaxed index lets every search server hold a read-only copy that changes in batches.',
          },
          {
            label: 'Every edit appears in every search, worldwide, within a second',
            why: 'Every edit would have to reach every search server at once, coupling a rare write to the hot read path, to give searchers a freshness they would not notice.',
          },
          {
            label: 'Both the business page and search may take up to a day',
            why: 'An owner who fixes wrong hours, reloads and sees the old ones files a support ticket. A page read by id is cheap to serve fresh from the store and its cache.',
          },
          {
            label: 'Freshness does not matter: rebuild the index once a month',
            why: 'A new business waits a month to be found, and a closed one sends people to a locked door for weeks.',
          },
        ],
      },
      points: [
        'Functional: search for businesses within a radius of a point (the user, or a pin on the map), with filters such as category, price and open now; read a business page by id; owners add and edit businesses.',
        `Latency: a search answers in under ${LATENCY_MS} ms at the 99th percentile on the server, since it is what the user waits for when the map opens.`,
        'Availability over strict consistency for reads: a search served from a slightly old index is fine; a search that fails is not.',
        'Freshness: edits reach search within a day (minutes is a bonus); the business page shows them at once.',
        'Results are ordered by distance. Ranking by ratings, reviews and personal taste, and the reviews and photos themselves, are out of scope: they are other services that re-rank or decorate the same candidates.',
        `Scale (from the interviewer): ${num(BUSINESSES / 1e6)} million businesses, ${num(DAILY_USERS / 1e6)} million daily users, read-heavy, with about ${EDITED_A_DAY * 100}% of businesses edited on a given day.`,
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the search load',
      prompt: `${num(DAILY_USERS / 1e6)} million daily users each search about ${SEARCHES_A_USER} times a day. Assume the peak hour runs at ${PEAK}x the daily average. How many searches a second at peak?`,
      estimate: {
        question: 'Searches per second at peak',
        answer: peakRps,
        unit: 'searches/s',
        working: [
          `${num(DAILY_USERS / 1e6)} million users × ${SEARCHES_A_USER} searches = ${num(searchesADay / 1e6)} million searches a day.`,
          `${num(searchesADay / 1e6)} million / 86,400 s ≈ ${num(averageRps)} searches a second on average.`,
          `× ${PEAK} at peak ≈ ${num(peakRps)} searches a second.`,
        ],
      },
      points: [
        `Scanning every business for each search would be ${num(peakRps)} × ${num(BUSINESSES / 1e6)} million ≈ ${trillions} trillion distance checks a second. The whole design is about reading a few hundred candidates instead.`,
        `Assume each search leads to about one business page view: another ${num(peakRps)} reads a second at peak, each a lookup by id.`,
        `Writes: ${EDITED_A_DAY * 100}% of ${num(BUSINESSES / 1e6)} million businesses is ${num(editsADay / 1e6)} million edits a day, about ${num(editsADay / 86_400)} a second, ${num(peakEdits)} at peak. Reads outnumber writes about ${num(peakReads / peakEdits)} to 1.`,
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate storage and the index',
      prompt: `Each business record holds a name, address, category, opening hours, phone, coordinates and attributes, about ${RECORD_KB} KB. Photos and reviews live in other services. How much storage do the records need?`,
      estimate: {
        question: 'Storage for the business records, one copy',
        answer: recordsGb,
        unit: 'GB',
        working: [
          `${num(BUSINESSES / 1e6)} million businesses × ${RECORD_KB} KB = ${num(recordsGb)} GB.`,
          `With ${REPLICAS} replicas, ${num(recordsGb * REPLICAS)} GB: one database cluster holds it, and it grows slowly because businesses are added at a trickle.`,
        ],
      },
      points: [
        `The location index needs far less: an entry is a business id, latitude, longitude and a word of filter bits (category, price, and coarse hours such as open late or open weekends), 8 bytes each, ${QUADTREE.entryBytes} bytes. ${num(BUSINESSES / 1e6)} million × ${QUADTREE.entryBytes} bytes = ${indexGb} GB.`,
        `${indexGb} GB fits in the memory of one ordinary server with room to spare, so every search server can hold the whole index and answer a search without touching a disk or another machine.`,
        'The search returns ids and distances; the page fields shown in the list (name, rating badge, photo) come from the business cache by id in one batch.',
      ],
    },
    {
      kind: 'api',
      title: 'Design the API',
      prompt: `Mobile and web clients search near a point and page through results, ${NEAREST} at a time. Design the search and business endpoints, and decide how the second page is fetched.`,
      decision: {
        question: 'How does a client get the next page of nearby results?',
        options: [
          {
            label:
              "A page token from the first response that holds the search (point, radius, filters), the index version it ran on, and the last result's distance and id; the next page continues after that pair",
            best: true,
            why: 'Distance plus id is a total order, so a page starts exactly after the last one, with no repeats or gaps, and the version lets the server answer from the same index snapshot even if a new one was loaded in between. If that version is no longer loaded, the server reruns the search on the current one and still continues after (distance, id), so at worst a moved or edited business repeats or is skipped once.',
          },
          {
            label: 'Offset and limit, such as `page=3&size=20`',
            why: 'Each page reruns the search and sorts past everything it skips, and when a new index version loads between pages, results shift: some repeat and some are never shown.',
          },
          {
            label: 'Return every result within the radius in one response',
            why: `At ${radiusText(BAND_RADIUS_KM)} downtown that can be hundreds or thousands of businesses, a large response for a phone that shows ${NEAREST}.`,
          },
          {
            label: "Keep each user's result list in the search server's memory and page through it",
            why: 'Memory per open search, sticky routing to one server, and the list is lost when that server restarts or the next request lands elsewhere.',
          },
        ],
      },
      points: [
        `\`GET /v1/search\` takes \`lat\`, \`lon\`, \`radius_m\` (default 2,000), filters such as \`category\` and \`open_now\`, and \`limit\` (${NEAREST}); it returns ids and distances with the fields the list shows, and a \`next_page_token\`.`,
        '`GET /v1/businesses/{id}` returns the full record. Owners create with `POST /v1/businesses` and edit with `PATCH` on the same URL, authenticated, sending the version they read so two edits cannot silently overwrite each other.',
        'The radius has a default and a maximum (say 50 km); without a radius the client asks for the nearest N and the server widens the search (see the edge cases).',
        'Coordinates are WGS 84 degrees, the system GPS uses; the server validates the ranges (latitude -90 to 90, longitude -180 to 180).',
        'If the user moves or pans the map, the client starts a new search rather than paging an old one.',
      ],
    },
    {
      kind: 'data',
      title: 'Choose a spatial index',
      prompt: `Businesses have a latitude and a longitude. "Everything within ${radiusText(BAND_RADIUS_KM)} of this point" is a question about two dimensions and a circle. Decide what kind of index answers it.`,
      decision: {
        question: `Which index finds every business within ${radiusText(BAND_RADIUS_KM)} of a point without reading far more than it returns?`,
        options: [
          {
            label:
              'A spatial one: each business keyed by a cell id (geohash or S2) in an ordinary sorted index, so the area becomes a few range reads, or a tree built for two dimensions, such as a quadtree or an R-tree (PostGIS GiST)',
            best: true,
            why: 'Nearby businesses get nearby keys, or sit under the same tree node, so the search reads only the cells or nodes around the circle and then checks true distances.',
          },
          {
            label: 'A B-tree on (latitude, longitude)',
            why: `The index can seek only on latitude, so it reads every business in a band ${num(2 * BAND_RADIUS_KM)} km tall around the whole planet and filters longitude inside it: at ${latText} that band is about ${num(Math.round(bandKm2 / 1000) * 1000)} km², about ${num(Math.round(bandKm2 / circleKm2 / 100) * 100)} times the ${Number(circleKm2.toFixed(1))} km² circle.`,
          },
          {
            label: 'Two B-trees, one on latitude and one on longitude, intersected',
            why: 'Each range is a band around the planet or a strip from pole to pole, holding hundreds of thousands of businesses each; intersecting two huge id lists costs far more than the few hundred results.',
          },
          {
            label: 'No index: compute the distance to every business and keep the close ones',
            why: `${num(BUSINESSES / 1e6)} million distance checks per search, ${trillions} trillion a second at peak.`,
          },
        ],
      },
      points: [
        `A B-tree sorts by one key. With (latitude, longitude), "within ${radiusText(BAND_RADIUS_KM)}" becomes a latitude range, and longitude is only a filter inside it. Spatial indexes fix that by mapping two dimensions to keys where nearby means close, or by building a tree on two dimensions.`,
        'Fixed grid: cut the map into equal squares, keyed by row and column. Simple, but one size for everywhere: a downtown square holds thousands of businesses and a desert square none.',
        'Geohash: interleave the bits of longitude and latitude and write them 5 at a time in base 32. A shared prefix means the same enclosing cell, so a cell is a prefix range in any sorted index (a B-tree, a sorted set). Next stage: cell sizes and edges.',
        'Quadtree: split any square holding too many businesses into four, recursively, so leaves are small where businesses are dense and large where they are not. Built in memory, not stored as a database index.',
        "S2 and H3: Google's S2 projects the sphere onto a cube and orders each face's cells along a Hilbert curve, with 64-bit cell ids and 31 levels, so cells stay similar in size even near the poles; a region coverer turns a circle into a few cells of mixed sizes. Uber's H3 tiles the planet with hexagons (and 12 pentagons per resolution) at 16 resolutions; every neighbour shares an edge and sits at about the same distance.",
        'R-trees: a balanced tree of bounding rectangles that indexes shapes as well as points. PostGIS builds one with a GiST index: `ST_DWithin` finds everything within a distance (in metres on the geography type), and `ORDER BY geom <-> point` with a `LIMIT` walks the index nearest first. A good default when the data already lives in Postgres and the load fits it.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        "Trace a search from the phone to a list of nearby businesses, and an owner's edit until it shows up in that search. Name each component.",
      lab: true,
      points: [
        'Search servers: stateless services behind a load balancer, each holding the whole location index in memory (a geohash map or a quadtree, plus the filter bits), loaded from a versioned snapshot.',
        'Business service: reads and writes business records by id in a relational database such as Postgres or MySQL with read replicas, behind a cache keyed by business id.',
        'Index builder: a batch job that reads every business from a replica (or a change stream), builds the next index snapshot, validates it and writes it to object storage with a version number.',
        'Search path: the phone sends its location and filters; a search server picks the cells, collects candidates, checks true distances and filters, sorts, and returns ids and distances; the list fields come from the business cache in one batch read.',
        'Edit path: the owner edits through the business service, which writes the database; the edit shows on the business page at once, and in search after the next index update.',
        `Open the build in the Design Lab: ${num(peakRps)} searches and as many page views a second at peak, ${num(peakReads)} reads, plus ${num(peakEdits)} edits: about ${num(labRps)} requests a second, ${readShare}% reads. The app tier stands for the search servers; the cache for what is answered from memory, the in-memory index and the cached pages; the database for the business store and its replicas.`,
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Search geohash cells and their neighbours',
      prompt: `At ${latText} a precision 6 geohash cell is ${size(6)} (wide by tall). A user stands ${kmText(EDGE_KM)} from the east edge of their cell, ${userCell}, and searches ${radiusText(SMALL_RADIUS_KM)}.`,
      decision: {
        question: 'Which cells does the search read?',
        options: [
          {
            label:
              "The user's cell and its 8 neighbours, at a precision whose cells are at least as wide and as tall as the radius, then check every candidate's true distance",
            best: true,
            why: `From anywhere in the middle cell, a radius no longer than a cell's sides cannot reach past the 3 × 3 block, so nothing is missed: here the 9 cells read ${num(nine.read)} places and keep the ${num(nine.found)} within ${radiusText(SMALL_RADIUS_KM)}.`,
          },
          {
            label: `Only the user's cell, ${userCell}`,
            why: `It finds ${num(own.found)} of the ${num(own.within)} places within ${radiusText(SMALL_RADIUS_KM)}. One of those missed is ${kmText(acrossKm)} away in ${acrossCell}, across the east edge, and its geohash shares only ${sharedPrefix(userCell, acrossCell)} characters with the user's.`,
          },
          {
            label: `Every cell that starts with ${userCell.slice(0, 5)}, the parent cell`,
            why: `Reading 32 times the area does not help: the parent cell ends at the same east edge, since a coarser edge is also an edge at every finer precision, so the place ${kmText(acrossKm)} away is still missed.`,
          },
          {
            label: 'Every precision 8 cell that overlaps the circle, to read as little as possible',
            why: `At ${size(8)} a cell, the circle's area alone is about ${num(Math.round(fineCells / 100) * 100)} cells: few wasted reads, but over a thousand lookups per search.`,
          },
        ],
      },
      widget: 'cells',
      points: [
        `Cell size by length at the Equator: 4 characters, ${size(4, 0)}; 5, ${size(5, 0)}; 6, ${size(6, 0)}; 7, ${size(7, 0)}; 8, ${size(8, 0)}. Each character adds 5 bits, alternately 3 longitude and 2 latitude bits or the reverse, so cells are square only every second length.`,
        `Height never changes, but width shrinks with the cosine of the latitude: at ${latText} cells are ${lonShrink}% narrower than at the Equator, so pick the precision at the user's latitude.`,
        `The edge problem: bits follow a Z-shaped curve, so places a few metres apart on either side of an edge can share a short prefix, or none at all across the Equator or the prime meridian. Around latitude 0 and longitude 0 the four quarters start with ${['s', 'e', '7', 'k'].join(', ')}. Never treat a shared prefix as a distance.`,
        'Neighbours come from decoding the cell, stepping one cell north, south, east or west (and diagonally) from its centre and encoding again, with longitude wrapping at 180 degrees.',
        `Pick the finest precision whose cells are at least the radius: ${radiusText(SMALL_RADIUS_KM)} at ${latText} is precision 6 (${size(6)}). A ${radiusText(1)} radius is longer than a precision 6 cell's ${kmText(p6.heightKm)} height, so 9 of them miss ${num(wide.missed)} of ${num(wide.within)} places here; precision 5 (${size(5)}) finds all ${num(coarse.found)} but reads ${num(coarse.read)}.`,
        'In a database the cell is an indexed column (or the prefix of a sorted key), and 9 cells are 9 prefix range reads, fewer when neighbouring cells are adjacent in geohash order and merge into one range.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Adapt to density with a quadtree',
      prompt:
        'A downtown block holds thousands of businesses per km² and the countryside a handful. With one geohash precision, a search reads thousands of places in one and ring after ring of empty cells in the other.',
      decision: {
        question: 'How do you keep the work of each search about the same everywhere?',
        options: [
          {
            label: `An in-memory quadtree: split any square holding more than about 100 businesses into four, recursively; build it from the business store and load it on every search server`,
            best: true,
            why: `Leaves hold a similar number of businesses wherever they are, so a search for the nearest ${NEAREST} opens a handful of leaves downtown or in a field. The whole tree, entries and nodes, fits in memory (${bytesText(tree.scaledBytes)} for ${num(BUSINESSES / 1e6)} million at 100 a leaf).`,
          },
          {
            label: 'One geohash precision everywhere, fine enough for downtown',
            why: `In the countryside the nearest ${NEAREST} lie many cells away, so a search reads ring after ring of empty cells.`,
          },
          {
            label: 'One geohash precision everywhere, coarse enough for the countryside',
            why: 'Downtown each cell holds thousands of businesses, all read and then dropped by the distance check.',
          },
          {
            label: 'A separate table per city, searched with a scan',
            why: 'City lines are arbitrary: a search near a boundary needs two tables, many businesses are in no city, and a scan of a big city table is still thousands of rows.',
          },
        ],
      },
      widget: 'quadtree',
      points: [
        `In the model, ${num(QUADTREE.places)} places around one city with at most 100 a leaf make a tree ${tree.depth} levels deep with ${num(tree.nodes)} nodes, and a search for the nearest ${NEAREST} visits about ${num(tree.visited)} nodes and checks about ${num(tree.examined)} places. At 5 a leaf it is ${tiny.depth} levels and ${num(tiny.nodes)} nodes, and a search checks ${num(tiny.examined)} places but walks ${num(tiny.visited)} nodes.`,
        `Memory: entries dominate. ${num(BUSINESSES / 1e6)} million × ${QUADTREE.entryBytes} bytes is ${indexGb} GB, and nodes of ${QUADTREE.nodeBytes} bytes add ${bytesText(tree.scaledBytes - BUSINESSES * QUADTREE.entryBytes)} at 100 a leaf. Tiny leaves multiply the nodes: at 5 a leaf the total is ${bytesText(tiny.scaledBytes)}.`,
        `Build: each split moves its places one level down, so building costs one step per place per level: ${num(tree.buildSteps)} steps here, ${Number(averageDepth.toFixed(1))} a place. With ${num(BUSINESSES / 1e6)} million places the tree is about log₄(${num(BUSINESSES / QUADTREE.places)}) ≈ ${Number((scaledDepth - averageDepth).toFixed(1))} levels deeper, about ${num(scaledDepth)} steps a place and ${Number(((BUSINESSES * scaledDepth) / 1e9).toFixed(1))} billion in all: a minute or a few on one core at tens of nanoseconds a step, and the four quadrants of the root build in parallel. It runs offline, never on a search server under load.`,
        'Nearest first: a best-first search keeps a queue ordered by distance, opens the closest node next, and stops once the nearest results are closer than anything unopened. No radius has to be guessed.',
        'A quadtree is a structure in memory, not a database index: rebuild it, or patch leaves as businesses change, and ship it as a snapshot.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Filter, rank and page the candidates',
      prompt: `The cells or leaves around the user returned a few hundred candidates, each with its coordinates and filter bits. Turn them into the first page of ${NEAREST} results.`,
      decision: {
        question: 'What happens to the candidates?',
        options: [
          {
            label:
              "Compute each one's haversine distance from the user, drop those beyond the radius or failing the filters, sort by distance then id, and return the first page with a token after the last (distance, id)",
            best: true,
            why: 'Cells only narrow the search; the true distance decides what is within the radius and in what order, and the id breaks ties so pages never repeat or skip.',
          },
          {
            label: "Sort by how many geohash characters each shares with the user's cell",
            why: `The place ${kmText(acrossKm)} from this user shares ${sharedPrefix(userCell, acrossCell)} characters, while a place in the far corner of the user's own cell, about ${kmText(cornerKm)} away, shares all 6: prefix length is not distance.`,
          },
          {
            label: 'Sort by straight-line distance on the raw latitude and longitude degrees',
            why: `At ${latText} a degree of longitude is ${lonShrink}% shorter than a degree of latitude, so businesses to the east and west look farther than they are and the order is wrong.`,
          },
          {
            label: 'Return the candidates in the order the cells are stored, without a distance check',
            why: 'The 9 cells reach well beyond the circle, so results include businesses outside the radius, in no meaningful order.',
          },
        ],
      },
      points: [
        `Haversine: with R = ${num(EARTH_RADIUS_KM)} km, d = 2R × asin(sqrt(sin²(Δφ/2) + cos φ1 × cos φ2 × sin²(Δλ/2))). On a sphere it is exact; the Earth's flattening puts it within about 0.5% of the true distance, close enough for "near me".`,
        'Over a few km an equirectangular approximation, Δλ × cos(φ) and Pythagoras, is cheaper and almost as close; compare squared distances to skip the square root when only the order matters.',
        'Filters on the bits in the index entry (category, price) run before any record is read; open now is checked against the hours in the cached record for the few hundred candidates that remain, so a search never queries the business store directly.',
        `Rank by distance here. A relevance ranking (ratings, reviews, popularity) would take more candidates by distance, a few hundred, and re-rank them in another service: out of scope.`,
        'A search returns a page token; a new location or new filters start a new search.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Scale the reads',
      prompt: `${num(peakRps)} searches a second at peak, users on every continent, and a ${indexGb} GB index. Decide how the index is spread across servers and regions.`,
      decision: {
        question: 'How is the location index spread across servers?',
        options: [
          {
            label:
              'A full copy of the index on every search server, with enough servers in each region for its peak; business pages read by id through a cache and read replicas',
            best: true,
            why: `${indexGb} GB fits in one server's memory, so any server answers any search alone, servers scale by adding copies, and a lost server loses nothing. Pages are lookups by id, which a cache absorbs.`,
          },
          {
            label: 'Shard the index by business id across 16 servers',
            why: 'Nearby businesses land on every shard, so each search asks all 16 and waits for the slowest; adding shards adds work to every search instead of splitting it.',
          },
          {
            label: 'Shard the index by country or city',
            why: `Shards are as uneven as the map (one for New York, one for Wyoming), a search near a border reads two, and it buys nothing while the whole index fits in one server's ${indexGb} GB.`,
          },
          {
            label: 'One central index cluster that every region queries',
            why: `A round trip between continents takes about 70 ms (New York to London) to 300 ms (Europe to Australia), most or all of the ${LATENCY_MS} ms budget, or several times it, and one cluster's failure stops search everywhere.`,
          },
        ],
      },
      points: [
        'Search servers keep no state beyond the snapshot they loaded, so autoscaling adds copies and a load balancer spreads searches; each region runs its own pool near its users, with every region holding the whole world (a few GB).',
        "Hot cells (city centres, airports): reading a cell is already a memory lookup, so the cost is the candidates. Split busy cells finer (a quadtree does this by itself), keep each busy cell's places pre-sorted by category so filters skip most of them, cap the candidates a search measures, and cache whole responses only for coarse zoomed-out map views, which many users share.",
        'Business pages: a cache by id in front of read replicas absorbs most of the page views; the primary takes only the edits.',
        'Shard the index by region only when it outgrows memory, for example with much richer entries: split by cell prefix with hot cities split finer, and send searches near a shard edge to both shards.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Update the index',
      prompt: `About ${num(editsADay / 1e6)} million edits a day, ${num(peakEdits)} a second at peak, change ${num(BUSINESSES / 1e6)} million businesses that hundreds of search servers each hold in memory. Search may lag by up to a day.`,
      decision: {
        question: 'How do edits reach the search servers?',
        options: [
          {
            label:
              "Build a new versioned snapshot nightly from the business store, ship small batches of the day's changes every few minutes on top, and have each server load a new version beside the old one and switch atomically",
            best: true,
            why: 'Building happens once, offline; servers only load and swap, so searches never see a half-built index, every server converges on the same version, and the previous version stays at hand for a rollback.',
          },
          {
            label: "Update every search server's index synchronously as part of each edit",
            why: 'One slow or unreachable server fails or blocks the edit, and a missed update leaves servers disagreeing with nothing to bring them back in line.',
          },
          {
            label: 'Have every search server rebuild from the database at the same time each night',
            why: `Every server reads all ${num(recordsGb)} GB from the database at once and serves nothing while it builds: a nightly load spike and outage, for the same result built hundreds of times.`,
          },
          {
            label: 'Lock the index during each rebuild so no search sees a partial update',
            why: 'Searches stop for as long as the build takes. Loading the new version beside the old one avoids both the lock and the partial view.',
          },
        ],
      },
      points: [
        "Snapshots carry a version and a checksum; servers report the version they serve, so the fleet's convergence is visible.",
        'Incremental batches: the business service publishes changes to a log (an outbox or change data capture); a job turns them into add, move and remove operations per cell and ships them with the base version they apply to.',
        'A move is a remove from the old cell and an add to the new one, applied together. Closed businesses are removed, not just flagged, so they stop costing reads.',
        'Memory during the switch: two versions of the index live side by side for a moment, so size servers for twice the index, a few more GB.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Handle sparse places, the edges of the map and moving users',
      prompt: `A user in the countryside asks for the nearest ${NEAREST} restaurants with no radius. Another stands near the 180th meridian, and a third is walking while the list is open.`,
      decision: {
        question: `How do you find the nearest ${NEAREST} when you do not know how far they are?`,
        options: [
          {
            label: `Search the 9 cells at a precision for a small default radius; if fewer than ${NEAREST} places lie within the distance those cells are sure to cover, step to a coarser precision (or one more ring of cells) and repeat, up to a maximum radius`,
            best: true,
            why: `It reads little downtown and widens only where places are sparse. Stopping only when ${NEAREST} places lie within the covered distance guarantees nothing closer sits in an unread cell.`,
          },
          {
            label: 'Always search a fixed 50 km radius',
            why: 'Downtown that reads hundreds of thousands of candidates to return 20, and it still stops at 50 km where places are rarer.',
          },
          {
            label: `Return whatever the 9 cells hold, even if fewer than ${NEAREST}`,
            why: 'In the countryside the list comes back empty while places a few km away exist.',
          },
          {
            label: `Take the nearest ${NEAREST} of whatever the 9 cells hold, even those beyond the distance the cells are sure to cover`,
            why: "The 9 cells are sure to cover only as far as the block's nearest edge; a place just beyond that edge can be closer than a candidate in the block's far corner.",
          },
        ],
      },
      points: [
        'A quadtree or an R-tree does this natively: best-first search opens the nearest node next, however far that is.',
        `With filters, widen until the nearest ${NEAREST} places that pass them lie within the covered distance; a rare category widens much further, so cap the radius and say so in the response.`,
        'Antimeridian: a 2 km circle around a point at 179.99° E crosses the 180th meridian, where longitude jumps to -180°. Neighbour cells wrap longitude, and distances use the haversine formula, which handles the wrap; never compare raw longitudes.',
        `Poles: cells become slivers (at ${POLE_LAT}° N a precision 5 cell is ${size(5, POLE_LAT)}) and there is no cell beyond the pole, so a polar circle may need every longitude. Few businesses are there, but the code must not loop or crash; S2's cube cells avoid most of this.`,
        'A moving user: search again only when they move more than a fraction of the radius or leave their cell, debounce map pans, and re-sort the last results on the phone between searches.',
        `Dense spots: at a stadium or an airport even a precision 7 cell (${size(7)}) can hold hundreds of places; the filter bits and a cap on candidates keep the search bounded.`,
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Plan for failure',
      prompt:
        'Three things will go wrong: a search server dies at peak, the business database is unavailable for an hour, and one night the index builder writes a snapshot missing half the businesses. Start with the one that reaches every user.',
      decision: {
        question: 'How do you stop a bad index snapshot from reaching users?',
        options: [
          {
            label:
              'Validate it before shipping (counts per region against the store, known searches with known answers, checksums), load it on a few canary servers and compare their results with the current version, then roll out, keeping the previous version loaded for an instant switch back',
            best: true,
            why: 'Each check catches what the one before missed, the canary limits who sees a bad version, and the old version in memory makes rollback a pointer swap instead of a rebuild.',
          },
          {
            label: 'Load it on every server at once, and fix forward if something looks wrong',
            why: 'Every search in the world sees the broken index until a new one is built, which takes the length of a build.',
          },
          {
            label: "Trust it if the builder's unit tests pass",
            why: 'Unit tests check the code, not the data it read that night: a replica that was lagging or a truncated export passes them.',
          },
          {
            label: 'Have each server rebuild from the database when it detects a problem',
            why: 'A server cannot tell a closed business from a missing one, and hundreds of servers rebuilding at once hammer the database.',
          },
        ],
      },
      points: [
        'A search server dies: the load balancer stops sending it searches; the others each hold the full index, so nothing is lost. A replacement loads the latest snapshot from object storage and joins once it reports ready.',
        'The business database is down: search keeps working from memory, and business pages from the cache; edits fail with a retryable error until it is back, and the next index update simply comes later.',
        'A region fails: DNS or anycast moves its users to the next region, which holds the same index; size each region with spare capacity for a neighbour.',
        'Index builder fails: servers keep the last good version; alert when the served version is older than a day.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Operate it',
      prompt: 'You have five minutes left. What do you watch, and what would page you?',
      points: [
        `Search: p50 and p99 latency against the ${LATENCY_MS} ms target, errors, and empty-result rate by region (a jump means a broken index or a bad deploy).`,
        'Work per search: candidates read per result returned, and how often the search had to widen; both show when a precision or leaf size no longer fits the data.',
        'Index: the version each server serves, its age, build duration and validation results; page when the fleet is split across versions for long or the index is more than a day old.',
        'Freshness: time from an edit to its first appearance in search, sampled with test businesses.',
        'Business pages: cache hit rate, replica lag and database load.',
        'Privacy: search servers log coarse cells, not exact coordinates, and keep no location history.',
      ],
    },
  ],
  pitfalls: [
    'Indexing latitude and longitude in ordinary B-trees and expecting a radius search to be fast.',
    "Reading only the user's cell, so a place across the edge, metres away, is missed.",
    'Ordering results by shared geohash prefix or by distance in raw degrees instead of true distance.',
    'Sharding the location index by business id, so every search asks every shard.',
    'One fixed radius or precision everywhere: thousands of wasted reads downtown, empty results in the countryside.',
    'Updating every search server synchronously on each edit instead of shipping versioned snapshots.',
  ],
  followUps: [
    {
      question: 'How would you rank by rating and relevance, not just distance?',
      answer:
        "Take more candidates by distance, a few hundred within the radius, and re-rank them with a score that combines distance, rating, review count, open now and the user's history. The ranking service reads its features by id; the location index still only narrows the search to nearby candidates.",
    },
    {
      question: 'The map shows a rectangle, not a circle. How do you search the visible area?',
      answer:
        'Cover the rectangle with cells (a set of geohash cells, or an S2 region covering of mixed sizes) and read those; filter candidates by whether they fall inside the rectangle. When zoomed out, show counts per cell instead of every business.',
    },
    {
      question: 'What changes if the points move, like drivers in a ride-hailing app?',
      answer:
        'Positions arrive every few seconds, so there is no nightly build: keep live positions in memory per city (a Redis geo set or a cell map), move a driver between cells only when it crosses an edge, expire silent ones, and stream history to a log. The Ride Sharing case covers it.',
    },
  ],
};
