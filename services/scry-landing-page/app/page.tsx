"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { Github, Zap, Lock, Code2, GitBranch, Clock, Check, X, Users, Activity } from "lucide-react"
import { useState, useEffect } from "react"

export default function Home() {
  const [terminalText, setTerminalText] = useState("")
  const [showCursor, setShowCursor] = useState(true)
  const fullCommand = "npx scry deploy"
  const formLink = process.env.NEXT_PUBLIC_FORM_LINK || "#"

  useEffect(() => {
    let index = 0
    const typingInterval = setInterval(() => {
      if (index <= fullCommand.length) {
        setTerminalText(fullCommand.slice(0, index))
        index++
      } else {
        clearInterval(typingInterval)
      }
    }, 100)

    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 500)

    return () => {
      clearInterval(typingInterval)
      clearInterval(cursorInterval)
    }
  }, [])

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white transition-colors">
      {/* Navigation */}
      <nav className="border-b border-gray-200 dark:border-white/10 backdrop-blur-sm fixed top-0 w-full z-50 bg-white/50 dark:bg-black/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-white dark:text-black" />
                </div>
                <span className="text-xl font-bold">Scry</span>
              </div>
              <div className="hidden md:flex items-center gap-6 text-sm">
                <a href="#features" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Features
                </a>
                <a href="#pricing" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Pricing
                </a>
                <a href="#comparison" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Compare
                </a>
                <a href="https://docs.scrymore.com" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Docs
                </a>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button size="sm" className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200" asChild>
                <a href={formLink}>Get Started</a>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-8">
            {/* Badges */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 px-3 py-1">
                <Lock className="w-3 h-3 mr-1" />
                Open Source
              </Badge>
              <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 px-3 py-1">
                <Zap className="w-3 h-3 mr-1" />
                5-Second Deploy
              </Badge>
              <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1">
                <Code2 className="w-3 h-3 mr-1" />
                Zero Config
              </Badge>
              <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 px-3 py-1">
                Free to Self-Host
              </Badge>
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl md:text-7xl font-bold leading-tight text-balance">
              Open Source Storybook
              <br />
              <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                Deployment in 5 Seconds
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto text-balance leading-relaxed">
              Fully transparent, community-driven, and yours to control. Self-host for free or use our managed service.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button size="lg" className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200 text-lg px-8 py-6" asChild>
                <a href={formLink}>Start Free</a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/10 text-lg px-8 py-6 bg-transparent"
                asChild
              >
                <a href="https://github.com/epinnock/scry-node">
                  <Github className="w-5 h-5 mr-2" />
                  View on GitHub
                </a>
              </Button>
            </div>

            {/* Terminal Demo */}
            <div className="mt-12 max-w-2xl mx-auto">
              <Card className="bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-white/10 p-6 text-left">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <span className="text-xs text-gray-500 ml-2">terminal</span>
                </div>
                <div className="font-mono text-sm">
                  <div className="text-gray-600 dark:text-gray-500">
                    $ {terminalText}
                    <span className={showCursor ? "opacity-100" : "opacity-0"}>|</span>
                  </div>
                  {terminalText.length === fullCommand.length && (
                    <>
                      <div className="text-cyan-600 dark:text-cyan-400 mt-2">✓ Building Storybook...</div>
                      <div className="text-cyan-600 dark:text-cyan-400">✓ Uploading assets...</div>
                      <div className="text-green-600 dark:text-green-400 mt-2">🚀 Deployed in 4.8s</div>
                      <div className="text-gray-600 dark:text-gray-400 mt-1">https://your-storybook.scry.app</div>
                    </>
                  )}
                </div>
              </Card>
            </div>

            {/* Social Proof */}
            <div className="flex flex-wrap items-center justify-center gap-8 pt-8 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span>150+ contributors</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-500" />
                <span>4.8s avg deploy</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-white to-gray-100 dark:from-black dark:to-gray-900">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Transparent, Community-Driven,
              <br />
              <span className="text-cyan-500 dark:text-cyan-400">Yours to Control</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Scry is fully open source. No black boxes, no surprises, no lock-in.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-white/50 dark:bg-gray-900/50 border-gray-200 dark:border-white/10 p-8 hover:border-cyan-500/30 transition-colors">
              <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-cyan-500 dark:text-cyan-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Fully Open Source</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>MIT license - inspect every line</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>No hidden behavior or data collection</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>Public GitHub repository</span>
                </li>
              </ul>
            </Card>

            <Card className="bg-white/50 dark:bg-gray-900/50 border-gray-200 dark:border-white/10 p-8 hover:border-blue-500/30 transition-colors">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Community Contributions</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>Issues and PRs encouraged</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>Public roadmap</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>Active Discord community</span>
                </li>
              </ul>
            </Card>

            <Card className="bg-white/50 dark:bg-gray-900/50 border-gray-200 dark:border-white/10 p-8 hover:border-purple-500/30 transition-colors">
              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mb-4">
                <Code2 className="w-6 h-6 text-purple-500 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Self-Host or We'll Host</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>Deploy on your infrastructure</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>Or use our managed service</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>No vendor lock-in, ever</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-gray-100 dark:bg-gray-900">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Deploy Faster, Build Better</h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">Everything you need to share your Storybook with the world</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-white dark:bg-black border-gray-200 dark:border-white/10 p-8">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-white dark:text-black" />
              </div>
              <h3 className="text-xl font-bold mb-3">Instant Deployment</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Deploy your Storybook with a single command. No complex setup.
              </p>
            </Card>

            <Card className="bg-white dark:bg-black border-gray-200 dark:border-white/10 p-8">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center mb-4">
                <GitBranch className="w-6 h-6 text-white dark:text-black" />
              </div>
              <h3 className="text-xl font-bold mb-3">Automatic Previews</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Every pull request gets its own preview deployment. Share with designers and stakeholders instantly.
              </p>
            </Card>

            <Card className="bg-white dark:bg-black border-gray-200 dark:border-white/10 p-8">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-white dark:text-black" />
              </div>
              <h3 className="text-xl font-bold mb-3">Permanent URLs</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Every build gets a permanent URL that never expires. Perfect for documentation and design systems.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section id="comparison" className="py-20 px-4 bg-white dark:bg-black">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Open Source vs. Proprietary</h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">Why developers choose Scry over closed-source alternatives</p>
          </div>

          <Card className="bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/10">
                    <th className="text-left p-6 text-gray-600 dark:text-gray-400 font-medium">Feature</th>
                    <th className="text-center p-6 font-bold">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-cyan-400 to-blue-500 rounded" />
                        Scry
                      </div>
                    </th>
                    <th className="text-center p-6 text-gray-600 dark:text-gray-400 font-medium">Others</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200 dark:border-white/10">
                    <td className="p-6">License</td>
                    <td className="p-6 text-center">
                      <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">Open Source</Badge>
                    </td>
                    <td className="p-6 text-center text-gray-500">Proprietary</td>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                    <td className="p-6">Self-hosting</td>
                    <td className="p-6 text-center">
                      <Check className="w-5 h-5 text-green-500 mx-auto" />
                    </td>
                    <td className="p-6 text-center">
                      <X className="w-5 h-5 text-red-500 mx-auto" />
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-white/10">
                    <td className="p-6">Onboarding speed</td>
                    <td className="p-6 text-center font-bold text-cyan-500 dark:text-cyan-400">5 seconds</td>
                    <td className="p-6 text-center text-gray-500">30+ seconds</td>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                    <td className="p-6">Configuration</td>
                    <td className="p-6 text-center font-bold text-cyan-500 dark:text-cyan-400">Zero</td>
                    <td className="p-6 text-center text-gray-500">Extensive setup</td>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-white/10">
                    <td className="p-6">Starting price</td>
                    <td className="p-6 text-center font-bold text-cyan-500 dark:text-cyan-400">Free</td>
                    <td className="p-6 text-center text-gray-500">$149+</td>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-white/5">
                    <td className="p-6">Community</td>
                    <td className="p-6 text-center">
                      <Check className="w-5 h-5 text-green-500 mx-auto" />
                    </td>
                    <td className="p-6 text-center">
                      <X className="w-5 h-5 text-red-500 mx-auto" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 bg-gradient-to-b from-white to-gray-100 dark:from-black dark:to-gray-900">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Transparent Pricing</h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">Free to self-host, or let us handle the infrastructure</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {/* Self-Hosted */}
            <Card className="bg-white dark:bg-gray-900 border-cyan-500/30 p-8 relative flex flex-col">
              <Badge className="absolute top-4 right-4 bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border-cyan-500/30">Popular</Badge>
              <div className="flex-grow">
                <h3 className="text-2xl font-bold mb-2">Self-Hosted</h3>
                <div className="text-4xl font-bold mb-4">$0</div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">Free Forever</p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Full feature access</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Deploy on your infrastructure</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Community support</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Unlimited projects</span>
                  </li>
                </ul>
              </div>
              <Button variant="outline" className="w-full border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/10 bg-transparent mt-auto" asChild>
                <a href="https://docs.scrymore.com">View Docs</a>
              </Button>
            </Card>

            {/* Managed Free */}
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-white/10 p-8 flex flex-col">
              <div className="flex-grow">
                <h3 className="text-2xl font-bold mb-2">Managed Free</h3>
                <div className="text-4xl font-bold mb-4">$0</div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">Per month</p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>100 builds/month</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Public projects only</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Community support</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Perfect for OSS</span>
                  </li>
                </ul>
              </div>
              <Button variant="outline" className="w-full border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/10 bg-transparent mt-auto" asChild>
                <a href={formLink}>Start Free</a>
              </Button>
            </Card>

            {/* Team */}
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-white/10 p-8 flex flex-col">
              <div className="flex-grow">
                <h3 className="text-2xl font-bold mb-2">Team</h3>
                <div className="text-4xl font-bold mb-4">Coming Soon</div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">Per month</p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Unlimited builds</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Private projects</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Team collaboration</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Priority support</span>
                  </li>
                </ul>
              </div>
              <Button className="w-full bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200 mt-auto" asChild>
                <a href={formLink}>Let's Talk</a>
              </Button>
            </Card>

            {/* Team + Intelligence */}
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-white/10 p-8 flex flex-col">
              <div className="flex-grow">
                <h3 className="text-2xl font-bold mb-2">Team + AI</h3>
                <div className="text-4xl font-bold mb-4">Coming Soon</div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">Per month</p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Everything in Team</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Visual regression testing</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>AI component search</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Advanced analytics</span>
                  </li>
                </ul>
              </div>
              <Button className="w-full bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200 mt-auto" asChild>
                <a href={formLink}>Let's Talk</a>
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 bg-gradient-to-b from-gray-100 to-white dark:from-gray-900 dark:to-black">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to Deploy in 5 Seconds?</h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            Join the community of developers who trust Scry for their Storybook deployments
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200 text-lg px-8 py-6" asChild>
              <a href={formLink}>Start Now</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/10 text-lg px-8 py-6 bg-transparent"
              asChild
            >
              <a href="https://github.com/epinnock/scry-node">
                <Github className="w-5 h-5 mr-2" />
                View on GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-white/10 py-12 px-4 bg-white dark:bg-black">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-white dark:text-black" />
                </div>
                <span className="text-xl font-bold">Scry</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">The open source Storybook deployment platform</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>
                  <a href="#features" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    Self-Hosting
                  </a>
                </li>
                <li>
                  <a href="#comparison" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    Compare
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Community</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>
                  <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    Discord
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    Contributing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    Roadmap
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>
                  <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    API Reference
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    CLI Guide
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                    Examples
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-400">
            <p>© 2025 Scry. Open source under MIT license.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                Status
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
