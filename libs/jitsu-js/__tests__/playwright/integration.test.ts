import { BrowserContext, expect, Page, test } from "@playwright/test";
import { createServer, SimpleSyrup } from "../simple-syrup";
import * as fs from "fs";
import * as path from "path";
import ejs from "ejs";
// import chalk from "chalk";
import * as process from "process";
import * as console from "console";
import { AnalyticsClientEvent, AnalyticsInterface } from "@jitsu/protocols/analytics.d";

test.use({
  ignoreHTTPSErrors: true,
});

const chalk = {
  cyan: (str: string) => str,
  bold: (str: string) => str,
};

const express = require("express");
const cookieParser = require("cookie-parser");
const app = express();
//const forge = require("node-forge");

let server: SimpleSyrup;

let requestLog: { type: string; body: AnalyticsClientEvent }[] = [];

test.beforeAll(async () => {
  const testCasesHandlers = fs.readdirSync(path.join(__dirname, "cases")).reduce((res, file) => {
    console.log("Processing file", file);
    return {
      ...res,
      [`/${file}`]: (req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.send(
          ejs.compile(
            fs.readFileSync(path.join(__dirname, "cases", file)).toString(),
            {}
          )({
            trackingBase: server.baseUrl,
          })
        );
      },
    };
  }, {});
  server = await createServer({
    port: 3088,
    https: process.env.DISABLE_HTTPS !== "1" && process.env.DISABLE_HTTPS !== "true",
    handlers: {
      "/p.js": (req, res) => {
        res.setHeader("Content-Type", "text/javascript");
        res.send(fs.readFileSync(path.join(__dirname, "../../dist/web/p.js.txt")).toString());
      },
      "/api/s/:type": (req, res) => {
        res.setHeader("Content-Type", "text/javascript");
        res.send({ ok: true });
        requestLog.push({
          type: req.params.type,
          body: req.body,
        });
      },
      ...testCasesHandlers,
    },
  });
  console.log("Running on " + server.baseUrl);
});

test.afterAll(async () => {
  await server?.close();
});

function sortKeysRecursively(obj: any): any {
  if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
    return Object.keys(obj)
      .sort()
      .reduce((res, key) => {
        res[key] = sortKeysRecursively(obj[key]);
        return res;
      }, {});
  }
  return obj;
}

function shouldKeepBrowserOpen() {
  return process.env.KEEP_BROWSER_OPEN === "true" || process.env.KEEP_BROWSER_OPEN === "1";
}

async function createLoggingPage(browserContext: BrowserContext): Promise<{ page: Page; uncaughtErrors: Error[] }> {
  const page = await browserContext.newPage();
  const errors: Error[] = [];

  page.on("pageerror", error => {
    errors.push(error);
    const border = chalk.cyan("│");
    console.log();
    console.log(`${border} ${chalk.cyan(`Browser Console UNCAUGHT ERROR:`)}`);
    console.log(`${border} ` + error.stack.split("\n").join(`\n${border} `));
  });

  page.on("console", msg => {
    const border = chalk.cyan("│");
    console.log();
    console.log(`${border} ${chalk.cyan(`Browser Console ${msg.type().toUpperCase()}`)}`);
    console.log(`${border} ` + msg.text().split("\n").join(`\n${border} `));
  });
  return { page, uncaughtErrors: errors };
}

const generateTestEvents = async () => {
  const implName = `${window["analytics"] ? "segment" : "jitsu"}`;
  const analytics = (window["analytics"] || window["jitsu"]) as AnalyticsInterface;
  console.log(`Generating test events. Implementation ${implName}: ${Object.keys(analytics)}`);
  await analytics.identify("userId2", { email: "john.doe2@gmail.com", caseName: "basic-identify" });
  // jitsu must extract traits even from 'id' object
  await analytics.identify({ email: "john.doe3@gmail.com", caseName: "identify-without-user-id" });
  await analytics.group("group1", { name: "Group 1", caseName: "basic-group" });
  await analytics.page({ caseName: "page-without-name", context: { page: { title: "Synthetic Title" } } });
  await analytics.page("test-page", { caseName: "page-with-name" });
  await analytics.track("testEvent", { caseName: "track-with-name" });
  console.log(`Test events for ${implName} has been generated`);
};

/**
 * This test isn't really testing anything. It generates reference segment events
 */
test("segment-reference", async ({ browser }) => {
  if (!process.env.SEGMENT_WRITE_KEY) {
    console.log("Skipping segment reference generation, no SEGMENT_WRITE_KEY provided");
    return;
  }
  // Using the browser fixture, you can get access to the BrowserContext
  const browserContext = await browser.newContext();
  const { page } = await createLoggingPage(browserContext);
  const requests: Record<string, { payload: any }[]> = {};
  page.on("response", async response => {
    const request = response.request();
    const apiPrefix = "https://api.segment.io/v1/";
    if (request.url().startsWith(apiPrefix) && request.method() === "POST") {
      const type = request.url().substring(apiPrefix.length);
      requests[type] = requests[type] || [];
      requests[type].push({
        payload: await request.postDataJSON(),
      });
    }
    console.log(`Request ${request.method()} ${request.url()} → ${response.status()}`);
  });

  await page.goto(`${server.baseUrl}/segment-reference.html?utm_source=source&utm_medium=medium&utm_campaign=campaign`);

  await page.waitForFunction(() => window["__analyticsReady"] === true, undefined, {
    timeout: 5000,
    polling: 100,
  });
  console.log("Segment has been page loaded. Sending events");
  await page.evaluate(generateTestEvents);
  const cookies = (await browserContext.cookies()).reduce(
    (res, cookie) => ({
      ...res,
      [cookie.name]: cookie.value,
    }),
    {}
  );
  console.log("🍪 Segment Cookies", cookies);

  for (const type of Object.keys(requests)) {
    for (const { payload } of requests[type]) {
      const dir = path.join(__dirname, "artifacts", "segment-reference");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(
        dir,
        `${payload.traits?.caseName || payload.properties?.caseName || payload.context?.caseName}.json`
      );
      fs.writeFileSync(file, JSON.stringify(sortKeysRecursively(payload), null, 2));
    }
  }
});

test("basic", async ({ browser }) => {
  const browserContext = await browser.newContext();

  const { page: firstPage, uncaughtErrors: fistPageErrors } = await createLoggingPage(browserContext);
  const [pageResult] = await Promise.all([
    firstPage.goto(`${server.baseUrl}/basic.html?utm_source=source&utm_medium=medium&utm_campaign=campaign`),
  ]);

  await firstPage.waitForFunction(() => window["jitsu"] !== undefined, undefined, {
    timeout: 1000,
    polling: 100,
  });
  expect(pageResult.status()).toBe(200);
  const cookies = (await browserContext.cookies()).reduce(
    (res, cookie) => ({
      ...res,
      [cookie.name]: cookie.value,
    }),
    {}
  );
  console.log("🍪 Jitsu Cookies", cookies);
  expect(fistPageErrors.length).toEqual(0);
  const anonymousId = cookies["__eventn_id"];
  expect(anonymousId).toBeDefined();
  expect(cookies["__eventn_uid"]).toBe("user1");
  expect(cookies["__eventn_id_usr"]).toBeDefined();
  expect(JSON.parse(cookies["__eventn_id_usr"]).email).toEqual("john.doe@gmail.com");
  let identifies = requestLog.filter(x => x.type === "identify");
  let pages = requestLog.filter(x => x.type === "page");
  let tracks = requestLog.filter(x => x.type === "track");
  expect(identifies.length).toBe(1);
  expect(pages.length).toBe(1);
  expect(tracks.length).toBe(1);

  const track = tracks[0].body as AnalyticsClientEvent;
  const page = pages[0].body as AnalyticsClientEvent;
  const identify = identifies[0].body as AnalyticsClientEvent;

  console.log(chalk.bold("📝 Checking track event"), JSON.stringify(track, null, 3));
  expect(track.properties.trackParam).toEqual("trackValue");
  expect(track.type).toEqual("track");
  expect(track.context.traits.email).toEqual("john.doe@gmail.com");
  expect(track.userId).toEqual("user1");
  expect(track.event).toEqual("pageLoaded");

  console.log(chalk.bold("📝 Checking identify event"), JSON.stringify(identify, null, 3));
  expect(identify.traits.email).toEqual("john.doe@gmail.com");
  expect(identify.userId).toEqual("user1");
  expect(identify.anonymousId).toEqual(anonymousId);

  console.log(chalk.bold("📝 Checking page event"), JSON.stringify(page, null, 3));
  expect(page.anonymousId).toEqual(anonymousId);
  expect(page.context.traits.email).toEqual("john.doe@gmail.com");
  expect(page.userId).toEqual("user1");

  expect(page.context.campaign.source).toEqual("source");

  const { page: secondPage, uncaughtErrors: secondPageErrors } = await createLoggingPage(browserContext);
  await secondPage.goto(`${server.baseUrl}/basic.html?utm_source=source&utm_medium=medium&utm_campaign=campaign`);
  await secondPage.waitForFunction(() => window["jitsu"] !== undefined, undefined, {
    timeout: 1000,
    polling: 100,
  });
  requestLog.length = 0;

  await secondPage.evaluate(generateTestEvents);
  expect(secondPageErrors.length).toBe(0);
  requestLog.forEach(({ body: payload }) => {
    const dir = path.join(__dirname, "artifacts", "requests");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      `${payload.traits?.caseName || payload.properties?.caseName || payload.context?.caseName}.json`
    );
    fs.writeFileSync(file, JSON.stringify(sortKeysRecursively(payload), null, 2));
  });
});
