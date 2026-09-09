'use client'

import Link from 'next/link'
import { CheckCircle2, Sparkles, Shield, ArrowUpRight, Headphones, Building2, Zap } from 'lucide-react'
import Button from '@/components/ui/Button'

const plans = [
 {
 name: 'Starter',
 tag: 'Free forever',
 price: '$0',
 billing: '/month',
 description: 'Test ProcureX with limited chats and catalog browsing.',
 features: [
 '3 AI chat sessions per day',
 'Basic product search',
 'Public vendor catalogue',
 'Email support (48h SLA)',
 'Export 1 quotation / week',
 ],
 ctaLabel: 'Continue with Free',
 ctaHref: '/register',
 highlighted: false,
 },
 {
 name: 'Pro',
 tag: 'Most Popular',
 price: '$59',
 billing: '/month',
 description: 'Unlock premium sourcing, live pricing, and workflow automation.',
 features: [
 'Unlimited AI conversations',
 'Live distributor pricing & stock',
 'Workflow automations & reminders',
 'Priority email + chat support (4h SLA)',
 'Unlimited quotation exports',
 ],
 ctaLabel: 'Upgrade to Pro',
 ctaHref: '/register?plan=pro',
 highlighted: true,
 },
 {
 name: 'Enterprise',
 tag: 'Custom',
 price: 'Let’s talk',
 billing: '',
 description: 'For teams that need dedicated procurement experts and integrations.',
 features: [
 'Dedicated account team',
 'Custom integrations & SLAs',
 'Multi-entity vendor management',
 'Advanced compliance controls',
 '24/7 white-glove support',
 ],
 ctaLabel: 'Book a demo',
 ctaHref: '/contact',
 highlighted: false,
 },
]

const addOns = [
 {
 title: 'Onboarding concierge',
 description: 'Live procurement expert to migrate your RFQs and vendor list.',
 price: '$499 one-time',
 },
 {
 title: 'Vendor verification pack',
 description: 'We vet up to 25 new vendors for compliance & bank checks.',
 price: '$999 / pack',
 },
 {
 title: 'ERP connector',
 description: 'Push orders to SAP, NetSuite or Microsoft Business Central.',
 price: 'Custom quote',
 },
]

const faqs = [
 {
 question: 'Can I stay on the free plan?',
 answer: 'Yes. The Starter tier remains free and you can upgrade or downgrade any time inside your workspace settings.',
 },
 {
 question: 'Do you offer annual billing?',
 answer: 'Absolutely. Annual plans receive two months free. Contact us and we will swap your billing cycle in minutes.',
 },
 {
 question: 'How does onboarding work?',
 answer: 'After upgrading we schedule a 45-minute onboarding call to connect your catalogues, vendors, and workflows.',
 },
]

export default function UpgradePage() {
 return (
 <div className="py-8 sm:py-12 lg:py-16 space-y-12 sm:space-y-16">
 <section className="text-center space-y-6">
 <span className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-primary-200 text-[#19C37D] bg-[#171717] text-sm font-semibold">
 <Sparkles className="w-4 h-4" />
 Premium procurement workspace
 </span>
 <div className="space-y-4 max-w-3xl mx-auto">
 <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#ececec] tracking-tight">
 Upgrade to Pro. Scale your sourcing with confidence.
 </h1>
 <p className="text-lg text-[#b4b4b4]">
 Compare plans to unlock live distributor pricing, unlimited AI chats, and concierge support for your purchasing team.
 </p>
 <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
 <Link href="/register?plan=pro" className="w-full sm:w-auto">
 <Button className="w-full sm:w-auto flex items-center justify-center gap-2">
 Upgrade now
 <ArrowUpRight className="w-4 h-4" />
 </Button>
 </Link>
 <Link href="/contact" className="w-full sm:w-auto">
 <Button variant="outline" className="w-full sm:w-auto">
 Talk to sales
 </Button>
 </Link>
 </div>
 </div>
 </section>

 <section className="grid gap-6 md:grid-cols-3">
 {plans.map((plan) => (
 <div
 key={plan.name}
 className={`relative rounded-2xl border p-6 bg-[#2f2f2f] flex flex-col ${
 plan.highlighted ? 'border-primary-500 ring-2 ring-primary-100' : 'border-[#2f2f2f]'
 }`}
 >
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm uppercase tracking-wide text-[#8e8e8e]">{plan.name}</p>
 <p className="text-3xl font-bold text-[#ececec] mt-2">{plan.price}</p>
 <p className="text-sm text-[#8e8e8e]">{plan.billing}</p>
 </div>
 <span
 className={`text-xs font-semibold px-3 py-1 rounded-full ${
 plan.highlighted ? 'bg-[#171717] text-[#19C37D]' : 'bg-[#2f2f2f] text-[#b4b4b4]'
 }`}
 >
 {plan.tag}
 </span>
 </div>
 <p className="text-sm text-[#b4b4b4] mt-4 flex-1">{plan.description}</p>
 <ul className="mt-6 space-y-3">
 {plan.features.map((feature) => (
 <li key={feature} className="flex items-start gap-2 text-sm text-[#b4b4b4]">
 <CheckCircle2 className="w-4 h-4 text-primary-500 mt-0.5" />
 {feature}
 </li>
 ))}
 </ul>
 <Link href={plan.ctaHref} className="mt-8">
 <Button
 className="w-full"
 variant={plan.highlighted ? 'primary' : 'outline'}
 >
 {plan.ctaLabel}
 </Button>
 </Link>
 </div>
 ))}
 </section>

 <section className="grid gap-8 lg:grid-cols-2">
 <div className="rounded-2xl border border-[#2f2f2f] bg-[#2f2f2f] p-5 sm:p-8 space-y-6">
 <div className="flex items-center gap-3">
 <Shield className="w-6 h-6 text-primary-600" />
 <div>
 <h3 className="text-xl font-semibold text-[#ececec]">What you get with Pro</h3>
 <p className="text-sm text-[#8e8e8e]">Key capabilities for modern procurement teams.</p>
 </div>
 </div>
 <div className="grid gap-4 sm:grid-cols-2">
 {[
 { title: 'AI copilots', description: 'Unlimited chats tuned for procurement, sourcing, and quote analysis.' },
 { title: 'Instant pricing', description: 'Live feeds from top distributors so you never overpay.' },
 { title: 'Workflow automation', description: 'Auto reminders, RFQ due dates, and approval nudges.' },
 { title: 'Collaboration', description: 'Share sessions, quote drafts, and vendor notes with your squad.' },
 ].map((item) => (
 <div key={item.title} className="p-4 rounded-xl bg-[#212121]">
 <p className="font-semibold text-[#ececec]">{item.title}</p>
 <p className="text-sm text-[#b4b4b4] mt-1">{item.description}</p>
 </div>
 ))}
 </div>
 </div>

 <div className="rounded-2xl border border-[#2f2f2f] bg-[#2f2f2f] p-5 sm:p-8 space-y-6">
 <div className="flex items-center gap-3">
 <Headphones className="w-6 h-6 text-primary-600" />
 <div>
 <h3 className="text-xl font-semibold text-[#ececec]">Premium support</h3>
 <p className="text-sm text-[#8e8e8e]">We pair you with procurement specialists.</p>
 </div>
 </div>
 <ul className="space-y-4 text-sm text-[#b4b4b4]">
 <li className="flex items-start gap-3">
 <CheckCircle2 className="w-4 h-4 text-primary-500 mt-0.5" />
 4-hour SLA on business days via chat, 24/7 for Enterprise.
 </li>
 <li className="flex items-start gap-3">
 <CheckCircle2 className="w-4 h-4 text-primary-500 mt-0.5" />
 Dedicated sourcing experts who review your RFQs and shortlist vendors.
 </li>
 <li className="flex items-start gap-3">
 <CheckCircle2 className="w-4 h-4 text-primary-500 mt-0.5" />
 Success playbooks to onboard your finance, compliance, and IT stakeholders.
 </li>
 </ul>
 <div className="rounded-xl bg-[#171717] border border-primary-100 p-4 flex items-center gap-3">
 <Building2 className="w-10 h-10 text-primary-600" />
 <div>
 <p className="font-semibold text-[#ececec]">Scaling a team of 5+ buyers?</p>
 <p className="text-sm text-[#b4b4b4]">Ask about our Enterprise pilots with multi-entity rollouts.</p>
 </div>
 </div>
 </div>
 </section>

 <section className="rounded-2xl border border-[#2f2f2f] bg-[#2f2f2f] p-5 sm:p-8 space-y-6">
 <div className="flex items-center gap-3">
 <Zap className="w-6 h-6 text-primary-600" />
 <div>
 <h3 className="text-xl font-semibold text-[#ececec]">Add-ons & services</h3>
 <p className="text-sm text-[#8e8e8e]">Mix and match to tailor ProcureX to your stack.</p>
 </div>
 </div>
 <div className="grid gap-4 md:grid-cols-3">
 {addOns.map((item) => (
 <div key={item.title} className="p-4 bg-[#212121] rounded-xl border border-[#2f2f2f]">
 <p className="font-semibold text-[#ececec]">{item.title}</p>
 <p className="text-sm text-[#b4b4b4] mt-2">{item.description}</p>
 <p className="text-sm text-[#19C37D] font-semibold mt-3">{item.price}</p>
 </div>
 ))}
 </div>
 </section>

 <section className="rounded-2xl border border-[#2f2f2f] bg-[#2f2f2f] p-5 sm:p-8 space-y-6">
 <div className="text-center space-y-2">
 <h3 className="text-2xl font-semibold text-[#ececec]">Questions? We’ve got answers.</h3>
 <p className="text-sm text-[#8e8e8e]">Everything about billing, security, and onboarding.</p>
 </div>
 <div className="grid gap-6 md:grid-cols-3">
 {faqs.map((faq) => (
 <div key={faq.question} className="space-y-2 text-left">
 <p className="font-semibold text-[#ececec]">{faq.question}</p>
 <p className="text-sm text-[#b4b4b4]">{faq.answer}</p>
 </div>
 ))}
 </div>
 <div className="text-center">
 <Link href="/contact">
 <Button variant="secondary">Still unsure? Chat with us.</Button>
 </Link>
 </div>
 </section>
 </div>
 )
}


