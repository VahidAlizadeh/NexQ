# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in NexQ, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

Email: **security@nexq.app**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix or mitigation**: Depends on severity

### Scope

NexQ is a local desktop application. Security concerns include:
- API key exposure or leakage
- Local privilege escalation
- Data exfiltration from the local machine
- Malicious update injection (mitigated by Ed25519 signature verification)

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Older versions | Best effort |
