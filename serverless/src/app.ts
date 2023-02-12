import { analize } from './libs/html-scraping';
import awsLambdaFastify from '@fastify/aws-lambda';
import fastify from 'fastify';

const app = fastify();

app.get('/', async (request, reply) => {
  return { hello: 'world' };
});

app.get('/analize', async (req, res) => {
  const resultObject = {};
  const urls = req.query.url ? [].concat.apply([], [req.query.url]) : [];
  for (const url of urls) {
    const data = await analize(url);
    resultObject[url] = data;
  }
  return resultObject;
});

export const handler = awsLambdaFastify(app);
