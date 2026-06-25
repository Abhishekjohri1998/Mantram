import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://mantram.ai';

export const options = {
  stages: [
    { duration: '1m', target: 2 },    // warm up: 2 concurrent users
    { duration: '2m', target: 5 },    // ramp to 5 concurrent users
    { duration: '3m', target: 5 },    // hold at 5
    { duration: '1m', target: 10 },   // spike: push to 10 concurrent users
    { duration: '2m', target: 10 },   // hold at 10
    { duration: '1m', target: 0 },    // cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],  // 95% of requests should be under 800ms
    http_req_failed: ['rate<0.01'],    // less than 1% of requests should fail
  },
};

// Runs once before the VUs start — log in and grab the shared token
export function setup() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: __ENV.LOAD_TEST_EMAIL || 'user@mantram.ai',
      password: __ENV.LOAD_TEST_PASSWORD || 'Mantram@2024',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, { 'login succeeded': (r) => r.status === 200 });
  const body = res.json();
  return { token: body.token };
}

// Runs repeatedly per virtual user — this is the "real user behavior" part
export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  const vuId = __VU;
  const iterId = __ITER;
  const uniqueSuffix = Math.floor(Math.random() * 1000000);

  console.log(`👤 [VU ${vuId} Iter ${iterId}] Starting studio flow...`);

  // 1. Onboard Brand (with random suffix to avoid duplicate brand errors)
  let brandRes = http.post(
    `${BASE_URL}/api/brands`,
    JSON.stringify({
      name: `K6 Brand ${vuId}_${iterId}_${uniqueSuffix}`,
      website: `https://k6-brand-${vuId}-${iterId}-${uniqueSuffix}.example.com`,
      industry: 'Software',
      tone: 'Professional',
      description: 'A mock brand built during concurrent load testing.'
    }),
    { headers }
  );
  
  if (!check(brandRes, { 'brand onboarded': (r) => r.status === 200 || r.status === 201 })) {
    console.error(`❌ [VU ${vuId} Iter ${iterId}] Brand Onboarding failed: ${brandRes.status} ${brandRes.body}`);
    return;
  }
  
  const body = brandRes.json();
  const brandObj = body.brand;
  if (!brandObj) {
    console.error(`❌ [VU ${vuId} Iter ${iterId}] Brand object is empty in response: ${brandRes.body}`);
    return;
  }
  const brandId = brandObj._id;
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Onboarded Brand ID: ${brandId}`);
  sleep(1);

  // 2. Brainstorm Studio (with 240s timeout for LLM generation)
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 2: Brainstorm Studio started...`);
  let brainstormRes = http.post(
    `${BASE_URL}/api/brainstorm-studio/strategy-mode`,
    JSON.stringify({
      mode: 'new-product-launch',
      brand: brandObj,
      inputs: {
        industryInput: 'tech SaaS',
        goalsInput: 'increase lead conversions',
        competitorsInput: 'competitor A'
      }
    }),
    { headers, timeout: '240s' }
  );
  const bsSuccess = check(brainstormRes, { 'brainstorm completed': (r) => r.status === 200 });
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 2: Brainstorm Studio completed. Success: ${bsSuccess}, Status: ${brainstormRes.status}`);
  sleep(1);

  // 3. Research Studio (with 240s timeout for crawling & LLM execution)
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 3: Research Studio started...`);
  let researchRes = http.post(
    `${BASE_URL}/api/research-studio/keywords`,
    JSON.stringify({
      brand: brandObj,
      brandId: brandId,
      query: 'cloud indexing efficiency'
    }),
    { headers, timeout: '240s' }
  );
  const resSuccess = check(researchRes, { 'research completed': (r) => r.status === 200 });
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 3: Research Studio completed. Success: ${resSuccess}, Status: ${researchRes.status}`);
  sleep(1);

  // 4. Content Studio (with 180s timeout for generation)
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 4: Content Studio started...`);
  let contentRes = http.post(
    `${BASE_URL}/api/content/generate`,
    JSON.stringify({
      brandId: brandId,
      type: 'social',
      prompt: 'Explain the benefits of mock load testing systems in SaaS.'
    }),
    { headers, timeout: '180s' }
  );
  const contentSuccess = check(contentRes, { 'content generated': (r) => r.status === 200 });
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 4: Content Studio completed. Success: ${contentSuccess}, Status: ${contentRes.status}`);
  sleep(1);

  // 5. Creative Studio (with 180s timeout for copy generation)
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 5: Creative Studio started...`);
  let creativeRes = http.post(
    `${BASE_URL}/api/creatives/generate`,
    JSON.stringify({
      brandId: brandId,
      type: 'facebook-ad',
      prompt: 'Banner layout showing concurrent mock executions.'
    }),
    { headers, timeout: '180s' }
  );
  const creativeSuccess = check(creativeRes, { 'creative generated': (r) => r.status === 200 || r.status === 202 });
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 5: Creative Studio completed. Success: ${creativeSuccess}, Status: ${creativeRes.status}`);
  sleep(1);

  // 6. Pulse Studio (with 180s timeout for design templates/copy)
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 6: Pulse Studio started...`);
  let pulseRes = http.post(
    `${BASE_URL}/api/brand-studio/aplus/generate`,
    JSON.stringify({
      brandId: brandId,
      productName: 'Platform Load Tester',
      keyFeatures: 'Concurrency, Mock interceptors, cleanups',
      brief: 'Generate layout for Platform Load Tester with Concurrency, Mock interceptors, cleanups'
    }),
    { headers, timeout: '180s' }
  );
  const pulseSuccess = check(pulseRes, { 'pulse generated': (r) => r.status === 200 });
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 6: Pulse Studio completed. Success: ${pulseSuccess}, Status: ${pulseRes.status}`);
  sleep(1);

  // 7. SEO Studio (with 300s timeout for complex scraping and reports)
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 7: SEO Studio started...`);
  let seoRes = http.post(
    `${BASE_URL}/api/seo-studio/health-check`,
    JSON.stringify({
      brandId: brandId,
      url: 'https://example.com'
    }),
    { headers, timeout: '300s' }
  );
  const seoSuccess = check(seoRes, { 'seo health check completed': (r) => r.status === 200 });
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 7: SEO Studio completed. Success: ${seoSuccess}, Status: ${seoRes.status}`);
  sleep(1);

  // 8. YouTube Studio (with 240s timeout for analysis)
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 8: YouTube Studio started...`);
  let ytRes = http.post(
    `${BASE_URL}/api/youtube-studio/analyse`,
    JSON.stringify({
      brandId: brandId,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      topic: 'How load testing scales applications'
    }),
    { headers, timeout: '240s' }
  );
  const ytSuccess = check(ytRes, { 'youtube analysis completed': (r) => r.status === 200 });
  console.log(`👤 [VU ${vuId} Iter ${iterId}] Step 8: YouTube Studio completed. Success: ${ytSuccess}, Status: ${ytRes.status}`);

  console.log(`👤 [VU ${vuId} Iter ${iterId}] All studio steps finished.`);
  sleep(Math.random() * 3 + 1);
}
