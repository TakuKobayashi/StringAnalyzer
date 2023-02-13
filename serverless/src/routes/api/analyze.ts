import { analize } from '@libs/html-scraping';

export async function analyzeApiRouter(app, opts): Promise<void> {
  app.get('/', async (req, res) => {
    res.send({ api: 'hello' });
  });
  app.get('/html', async (req, res) => {
    const resultObject = {};
    const urls = req.query.url ? [].concat.apply([], [req.query.url]) : [];
    for (const url of urls) {
      const data = await analize(url);
      resultObject[url] = data;
    }
    return resultObject;
  });
}
