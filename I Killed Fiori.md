# I Killed Fiori (And I'd Do It Again)

**Alice Vinogradova**  
Senior Software Engineer at Microsoft

*June 26, 2025*

## Or: How TRIZ Taught Me The Best UI Is No UI

Hey SAP folks! 👋

Deep breath.

I have a confession: I killed Fiori. Not in one system — in all of them. Before you grab your pitchforks, hear me out.

I loved Fiori when it launched in 2013. Finally, SAP that didn't look like Windows 95! Responsive design! Tiles! But it's 2025, and we're still... clicking... through... tiles... to... do... everything.

After working with Fiori since 2015, I had an epiphany that would make any TRIZ (innovation theory) person weep with joy:

> "The ideal system is one that doesn't exist but its function is performed."

## The "This Can't Be The Future" Moment

Picture this: 9 AM Monday. CFO pings you: "Need the latest P&L for company 1000 — compare this quarter to last, right now."

### The Fiori Way™:
1. Open Fiori Launchpad (wait for tiles to load)
2. Find "Financial Statement Analysis" app
3. Click tile (wait for app to load)
4. Select company code from dropdown
5. Choose fiscal period and year
6. Apply profit center filters
7. Navigate through multiple screens
8. Export to Excel for actual analysis

**Time:** ~4 minutes · **23 clicks** · **8 screens** · **Frustration:** Daily

### The 2025 Way:

**Me:** Show me P&L breakdown for company code 1000, this quarter vs last quarter

**Claude:** Q4 2024 vs Q3 2024 analysis ready:
- Revenue: +12% ($2.4M → $2.7M)
- EBITDA margin improved 3.2% (cost optimization in logistics)
- Key driver: 18% increase in Product Line A

**Time:** 8 seconds · **Clicks:** 0 · **Sanity:** Preserved

## How I Built The Ultimate Weapon

I knew exactly what I wanted to track. After years with Fiori, I understood the game. So I built a Chrome extension that captures:

- Every click, input, form submission
- Every OData request triggered by those clicks
- Complete UI5 context and metadata
- Atomic action decomposition with parametrization

The pattern was always there:

```
User Action → UI Update → OData Call → Backend Logic
```

The TRIZ insight: Why do we need the first two steps at all?

```
OData Call → Backend Logic
```

(Whisper: MCP - OData Bridge!)

## The Shocking Truth: 80% Pure Waste

My extension analysed hundreds of Fiori sessions across different apps. The results?

Real data from "Manage Detection Methods":

- **Duration:** 27.7 seconds
- **Clicks:** 10
- **OData requests:** 15
- **@UI annotations involved:** 23
- **Actual business logic:** Update one field

Pattern discovery:

- **UI Layer:** 80% overhead (pure translation)
- **Business Logic:** 20% actual work
- **Innovation opportunity:** Eliminate the 80%

## Liberation from @UI Annotation Hell

Remember wrestling with cryptic @UI annotations? Hours spent debugging why fields don't appear, fighting responsive design, calling consultants when layouts break.

When you eliminate the UI, you eliminate the entire annotation ecosystem. Clean CDS views with pure business logic. No more @UI.* black magic.

## The Three Pillars That Killed Fiori

1. **Parametrized Automation** → Record once, replay forever with different parameters
2. **Intelligent Test Generation** → Describe in English, auto-generate reliable tests
3. **AI-Ready Business Tools** → Convert interactions to semantic tools Claude understands

## The Transformation Results

| Metric | Fiori Manual | AI Direct |
|--------|--------------|-----------|
| Time to update | 27.7 seconds | 1.2 seconds |
| Actions required | 10 clicks | 1 sentence |
| Network requests | 15 | 1 |
| Annotations maintained | 23 lines | 0 lines |
| Training time | 2-3 hours | "Just ask" |

**95% time reduction. 100% complexity elimination.**

## The "But What About..." Section

**"But what about data visualization?"** Great question! Complex charts and graphs? Keep those Fiori apps. But for the 80% of interactions that are just CRUD operations? Dead.

**"But what about user permissions?"** The OData services already handle that. If you can't do something in Fiori, the AI can't do it either. Security preserved, clicking eliminated.

**"But what about complex workflows?"** You mean like "Create PO → Route for approval → Update inventory"? Watch this:

**"But what about mobile?"** You know what works great on mobile? Chat. You know what doesn't? Trying to click tiny Fiori tiles on a phone screen.

## What This Means For You

- **For Functional Consultants:** Demonstrate a process once, get automation forever. No coding required.
- **For Developers:** Focus on business logic. Let AI handle the interaction layer.
- **For Managers:** Measure ROI in seconds saved × transactions per day. The math is beautiful.
- **For Everyone:** The future isn't better UIs — it's no UIs at all.

## Your Turn

Ready to kill your own Fiori apps? The extension turns any SAP professional into an automation architect.

What's your most time-wasting Fiori workflow? Comment below with your biggest pain point — I'll analyse the potential time savings and show you the elimination path.

> The ideal interface is one that doesn't exist but gets the job done.

Time to evolve beyond clicking. 🚀

**Technical deep-dive and extension demo** ➜ [Coming Soon]  
**Next week:** "How TRIZ Principle 13 Made SAP Read My Mind"

**Quick Reference/Glossary:** see in comments.  
Let me know in comments what you want me to eliminate next =)