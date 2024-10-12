import * as chai from 'chai';
const expect = chai.expect;

import { RealtimeAPI } from '../../index.js';

export async function run() {
  describe('RealtimeAPI', ({ debug = false } = {}) => {
    let realtime;

    it('Should instantiate the RealtimeAPI with no apiKey', () => {
      realtime = new RealtimeAPI({
        url: "wss://openai-hu-east-us2.openai.azure.com/openai/realtime?api-version=2024-10-01-preview&deployment=gpt-4o-realtime-preview",
        debug,
      });

      expect(realtime).to.exist;
      expect(realtime.apiKey).to.not.exist;
    });

    it('Should fail to connect to the RealtimeAPI with no apiKey', async () => {

      try{
        await realtime.connect();
        const event = await realtime.waitForNext('server.error', 1000);
  
        expect(event).to.exist;
        expect(event.error).to.exist;
        expect(event.error.message).to.contain('Incorrect API key provided');
      }catch(e){  
        expect(e).to.exist;
        expect(e.message).to.contain('Could not connect');
      }
    });

    it('Should instantiate the RealtimeAPI', () => {
      realtime = new RealtimeAPI({
        url: "wss://openai-hu-east-us2.openai.azure.com/openai/realtime?api-version=2024-10-01-preview&deployment=gpt-4o-realtime-preview&api-key=510d6cd694fa49efab5fb0eccb3e633f",
        apiKey: "510d6cd694fa49efab5fb0eccb3e633f",
        debug,
      });

      expect(realtime).to.exist;
      expect(realtime.apiKey).to.equal("510d6cd694fa49efab5fb0eccb3e633f");
    });

    it('Should connect to the RealtimeAPI', async () => {
      const isConnected = await realtime.connect();

      expect(isConnected).to.equal(true);
      expect(realtime.isConnected()).to.equal(true);
    });

    it('Should close the RealtimeAPI connection', async () => {
      realtime.disconnect();

      expect(realtime.isConnected()).to.equal(false);
    });

    after(() => {
      realtime.isConnected() && realtime.disconnect();
    });
  });
}