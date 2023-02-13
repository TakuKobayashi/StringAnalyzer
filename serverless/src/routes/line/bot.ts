import { TextMessage, LocationMessage, TemplateMessage } from '@line/bot-sdk';
import { Client } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.LINE_BOT_CHANNEL_ACCESSTOKEN,
  channelSecret: process.env.LINE_BOT_CHANNEL_SECRET,
};
export const lineBotClient = new Client(config);

export async function lineBotRouter(app, opts): Promise<void> {
  app.get('/', async (req, res) => {
    res.send('hello line');
  });
  app.post('/message', async (req, res) => {
    const messageEvent = req.body;
    const eventReplyPromises: Promise<void>[] = [];
    for (const event of messageEvent.events) {
      eventReplyPromises.push(handleEvent(event));
    }

    await Promise.all(eventReplyPromises);
    return messageEvent;
  });
}

async function handleEvent(event): Promise<void> {
  console.log(event);
  if (event.type === 'follow') {
    const profile = await lineBotClient.getProfile(event.source.userId);
    console.log(profile);
  } else if (event.type === 'unfollow') {
  } else if (event.type === 'message') {
    if (event.message.type === 'text') {
      const echo: TextMessage = { type: 'text', text: event.message.text };
      await lineBotClient.replyMessage(event.replyToken, echo);
    } else if (event.message.type === 'location') {
    } else if (event.message.type === 'sticker') {
      const echo: TextMessage = { type: 'text', text: 'sticker message received' };
      await lineBotClient.replyMessage(event.replyToken, echo);
    }
  }
}
