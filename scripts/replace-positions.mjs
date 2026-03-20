import fs from 'node:fs/promises';
import path from 'node:path';

function normalizeId(v) {
  return (v || '').replace(/^\/+/, '').trim();
}

async function read(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function write(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data));
}

function buildMap(rows) {
  const map = new Map();

  for (const r of rows) {
    if (!r.slug || !r.position) continue;
    map.set(normalizeId(r.slug), {
      x: r.position[0],
      y: r.position[1],
      z: r.position[2]
    });
  }

  return map;
}

async function main() {
  const [,, graphPath, positionsPath, outPath] = process.argv;

  const graph = await read(graphPath);
  const positions = await read(positionsPath);

  const map = buildMap(positions);

  let replaced = 0;
  let missing = 0;

  graph.nodes = graph.nodes.map(n => {
    const key = normalizeId(n.id);
    const p = map.get(key);

    if (!p) {
      missing++;
      return n;
    }

    replaced++;
    return { ...n, ...p };
  });

  await write(outPath, graph);

  console.log('DONE');
  console.log('replaced:', replaced);
  console.log('missing:', missing);
}

main();
