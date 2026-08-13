/**
 * Run: npx --yes tsx src/lib/research/relevance-selftest.ts
 */
import {
  buildResearchQuality,
  buildTopicProfile,
  evaluateCandidate,
  isAmbedkarUntouchablesTopic,
  isBlockedOutlineTitle,
  MIN_RELEVANCE,
  queryIsOnTopic,
} from "./relevance";
import { categorize } from "../generate/analyze";
import type { SourceRecord } from "../types";

const TOPIC =
  "The Untouchables: Who Were They and Why They Became Untouchables? — Dr. B. R. Ambedkar";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  assert(isAmbedkarUntouchablesTopic(TOPIC), "topic should be detected as Ambedkar / Untouchables");
  assert(categorize(TOPIC, "Educational Book") === "historical", "category must be historical, not academic/biography");

  const profile = buildTopicProfile(TOPIC, { category: "historical", type: "Educational Book" });
  assert(profile.kind === "named-work-inquiry", "kind");
  assert(profile.allowArxiv === false, "arxiv must be disabled");
  assert(profile.allowGithub === false, "github must be disabled");
  assert(profile.allowBroadBiography === false, "no full biography crawl");
  assert((profile.chapterPlan?.length || 0) >= 12 && (profile.chapterPlan?.length || 0) <= 15, "12–15 chapters");
  assert(
    profile.searchQueries.every((q) => queryIsOnTopic(q, profile)),
    "every generated query must be on-topic"
  );
  assert(
    !profile.searchQueries.some((q) => /biography|indo-aryan|communism|popular culture/i.test(q)),
    "queries must not be broad biography / indo-aryan / communism"
  );

  const blocked = ["Religion", "Communism", "Indo-Aryan migrations", "In popular culture", "Works", "Terminology", "Official term"];
  for (const t of blocked) {
    assert(isBlockedOutlineTitle(t, profile), `outline must reject “${t}”`);
  }
  assert(!isBlockedOutlineTitle("The Broken Men theory", profile), "thesis chapters must be allowed");

  const physics = evaluateCandidate(
    {
      title: "Improved gravitational-wave detector performance at LIGO",
      url: "https://arxiv.org/abs/2301.00001",
      snippet:
        "We report on quantum noise and interferometer sensitivity for gravitational wave detection and particle physics detector performance at LIGO.",
      extractedText:
        "Gravitational waves from a black-hole merger were recovered with an improved waveform template. The Higgs boson is unrelated. Detector performance improved.",
      provider: "arxiv",
    },
    profile
  );
  assert(!physics.accepted && physics.relevanceScore < MIN_RELEVANCE, "arxiv physics must be rejected");
  assert(/physics|gravitational|scientific/i.test(physics.rejectionReason || ""), "physics rejection reason");

  const film = evaluateCandidate(
    {
      title: "The Untouchables (film)",
      url: "https://en.wikipedia.org/wiki/The_Untouchables_(film)",
      snippet: "The Untouchables is a 1987 American crime film directed by Brian De Palma, starring Kevin Costner as Eliot Ness against Al Capone.",
      extractedText: "Prohibition-era Chicago. Eliot Ness and the Untouchables take on Al Capone. Box office success.",
    },
    profile
  );
  assert(!film.accepted, "1987 film must be rejected");

  const book = evaluateCandidate(
    {
      title: "The Untouchables: Who Were They and Why They Became Untouchables?",
      url: "https://en.wikipedia.org/wiki/B._R._Ambedkar",
      snippet:
        "Ambedkar's 1948 book The Untouchables advances the Broken Men theory of untouchability and discusses beef-eating, Brahmins, and Buddhism.",
      extractedText:
        "In The Untouchables (1948) B. R. Ambedkar asked who the Untouchables were. He proposed that Broken Men lived on village outskirts, were linked to Buddhism, and became untouchable in part because they continued beef-eating after Brahmins gave it up. This is Ambedkar's interpretation.",
    },
    profile
  );
  assert(book.accepted && book.relevanceScore >= MIN_RELEVANCE, `book source must pass, got ${book.relevanceScore}`);

  const titleOnly = evaluateCandidate(
    {
      title: "The Untouchables Ambedkar",
      url: "https://example.com/random",
      snippet: "",
    },
    profile
  );
  assert(!titleOnly.accepted, "title-only hits must not be accepted");

  const quality = buildResearchQuality(
    [
      {
        id: 1,
        title: book.reasonForInclusion,
        organization: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Untouchability",
        domain: "en.wikipedia.org",
        snippet: "untouchability",
        extractedText: "untouchability ambedkar broken men",
        retrievedAt: new Date().toISOString(),
        tier: 7,
        score: book.relevanceScore,
        used: true,
        relevanceScore: book.relevanceScore,
        authorityScore: book.authorityScore,
        primarySource: false,
        academicSource: false,
        reasonForInclusion: book.reasonForInclusion,
      } as SourceRecord,
    ],
    [
      {
        title: physics.reasonForInclusion || "physics",
        url: "https://arxiv.org/abs/2301.00001",
        relevanceScore: physics.relevanceScore,
        rejectionReason: physics.rejectionReason || "",
      },
    ]
  );
  assert(quality.generationBlocked, "a single approved source should still block writing");
  assert(quality.rejectedCount === 1, "rejected count");

  const physProfile = buildTopicProfile("Gravitational wave astronomy", { category: "scientific" });
  assert(physProfile.allowArxiv, "physics topics may use arxiv");

  console.log("relevance self-test passed");
  console.log(
    JSON.stringify(
      {
        chapters: profile.chapterPlan?.map((c) => c.title),
        queries: profile.searchQueries,
        physicsRejected: physics.rejectionReason,
        filmRejected: film.rejectionReason,
        bookRelevance: book.relevanceScore,
      },
      null,
      2
    )
  );
}

main();
