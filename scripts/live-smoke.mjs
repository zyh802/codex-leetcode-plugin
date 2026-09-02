import { HttpClient } from "../dist/adapter/http-client.js";
import { LeetCodeCnAdapter } from "../dist/adapter/leetcode-cn.js";

const http = new HttpClient({
  baseUrl: "https://leetcode.cn",
  requestIntervalMs: 1_000,
  timeoutMs: 30_000,
});
const adapter = new LeetCodeCnAdapter(http);

const catalog = await adapter.getCatalog("algorithms");
const detail = await adapter.getQuestionDetail("two-sum");
const auth = await adapter.getAuthStatus();

process.stdout.write(`${JSON.stringify({
  catalogCount: catalog.length,
  firstSlug: catalog[0]?.slug,
  anonymousSignedIn: auth.signedIn,
  detail: {
    questionId: detail.questionId,
    slug: detail.slug,
    translatedTitle: detail.translatedTitle,
    templates: detail.templates.length,
    tags: detail.tags.length,
    enableRunCode: detail.enableRunCode,
  },
}, null, 2)}\n`);
