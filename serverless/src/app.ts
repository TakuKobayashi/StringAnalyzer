import 'source-map-support/register';

import { APIGatewayEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import * as awsServerlessExpress from 'aws-serverless-express';
import * as express from 'express';
import { analize } from './common/html-scraping';
import axios from 'axios';

const app = express();
const server = awsServerlessExpress.createServer(app);
const cors = require('cors');
const cookieParser = require('cookie-parser');

app.use(cookieParser());

app.use(cors({ origin: true }));

app.get('/', (req, res) => {
  res.json({ hello: 'world' });
});

app.get('/analizer', async (req, res) => {
  const resultObject = {};
  const urls = req.query.url ? [].concat.apply([], [req.query.url]) : [];
  for (const url of urls) {
    const data = await analize(url);
    resultObject[url] = data;
  }
  res.json(resultObject);
});

export const handler: APIGatewayProxyHandler = (event: APIGatewayEvent, context: Context) => {
  awsServerlessExpress.proxy(server, event, context);
};
