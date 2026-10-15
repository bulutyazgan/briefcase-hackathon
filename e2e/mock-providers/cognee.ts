// Cognee API replica: per-dataset text storage; search returns stored texts.

interface Stored { text: string; date: string }

const datasets = new Map<string, Stored[]>()

export function resetCognee(): void {
  datasets.clear()
}

export function seedCognee(dataset: string, text: string, date: string): void {
  const entries = datasets.get(dataset) ?? []
  entries.push({ text, date })
  datasets.set(dataset, entries)
}

export function cogneeDatasets(): Record<string, Stored[]> {
  return Object.fromEntries(datasets)
}

async function readAdd(request: Request): Promise<{ dataset: string; texts: string[] }> {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const body: unknown = await request.json()
    const record = body !== null && typeof body === 'object' ? Object.fromEntries(Object.entries(body)) : {}
    const data = record.data ?? record.raw_data ?? record.text
    const texts = Array.isArray(data) ? data.map(String) : [String(data ?? '')]
    return { dataset: String(record.datasetName ?? record.dataset_name ?? 'main_dataset'), texts }
  }
  const form = await request.formData()
  const texts = [...form.getAll('raw_data'), ...form.getAll('data')].map((value) => typeof value === 'string' ? value : value.name)
  return { dataset: String(form.get('datasetName') ?? 'main_dataset'), texts }
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9%]+/).filter((word) => word.length > 2)
}

export async function handleCognee(request: Request, url: URL): Promise<Response> {
  if (!request.headers.get('x-api-key')) {
    return Response.json({ detail: 'Missing X-Api-Key' }, { status: 401 })
  }
  const path = url.pathname
  if (path === '/api/v1/add' || path === '/api/v1/remember') {
    const { dataset, texts } = await readAdd(request)
    const date = new Date().toISOString().slice(0, 10)
    for (const text of texts) if (text) seedCognee(dataset, text, date)
    return Response.json({ status: 'ok', dataset, added: texts.length })
  }
  if (path === '/api/v1/cognify') {
    return Response.json({ status: 'completed' })
  }
  if (path === '/api/v1/search') {
    const body: unknown = await request.json()
    const record = body !== null && typeof body === 'object' ? Object.fromEntries(Object.entries(body)) : {}
    const query = String(record.query ?? '')
    const names = Array.isArray(record.datasets) ? record.datasets.map(String) : [...datasets.keys()]
    const queryWords = new Set(words(query))
    const entries = names.flatMap((name) => datasets.get(name) ?? [])
    // Graph completion returns the dataset's facts ranked by overlap with the query;
    // every stored fact in the requested datasets is returned so recall is complete.
    const ranked = entries
      .map((entry) => ({ entry, score: words(entry.text).filter((word) => queryWords.has(word)).length }))
      .sort((left, right) => right.score - left.score)
    return Response.json({ results: ranked.map(({ entry }) => ({ text: entry.text, date: entry.date })) })
  }
  return Response.json({ detail: 'Not Found' }, { status: 404 })
}
