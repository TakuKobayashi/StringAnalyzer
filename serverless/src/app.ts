import { analize } from '@libs/html-scraping';
import awsLambdaFastify from '@fastify/aws-lambda';
import fastify from 'fastify';
import { lineBotRouter } from '@routes/line/bot';
import { analyzeApiRouter } from '@routes/api/analyze';

const app = fastify();

app.get('/', async (request, reply) => {
  return { hello: 'world' };
});

app.register(lineBotRouter, { prefix: '/line/bot' });
app.register(analyzeApiRouter, { prefix: '/api/analyze' });

export const handler = awsLambdaFastify(app);
