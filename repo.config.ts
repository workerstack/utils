import { defineConfig } from "@workerstack/repo";

export default defineConfig({
  packs: ["agents", "standards", "docs", "release"],
  // Each repo links @workerstack/repo from the sibling checkout, so a push must go while it is linked.
  link: { push: "allow" },
  owner: { github: "lovrozagar", name: "Lovro Žagar" },
  // davidzagar pairs on this repo; GitHub credits a commit to both people through this trailer.
  commit: { coAuthors: ["David Žagar <353693948+davidzagar@users.noreply.github.com>"] },
  agents: { hosts: ["claude", "codex", "antigravity", "grok", "cursor"] },
});
