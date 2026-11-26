import type { NextConfig } from "next";

// Security headers and the CSP arrive with sign-in (#44), and `output: "standalone"` with the
// Dockerfile (#4, part 3).
const nextConfig: NextConfig = {
  // `next dev` otherwise writes an AGENTS.md here when it detects a coding agent. The
  // repository's guidance for agents is CLAUDE.md, at the root.
  agentRules: false,
};

export default nextConfig;
