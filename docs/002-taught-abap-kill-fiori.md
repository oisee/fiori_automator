# I Taught ABAP to Kill Fiori (From The Inside)

**Alice Vinogradova**
Senior Software Engineer at Microsoft

*September 2025*

## Or: How Transaction /IWFND/GW_CLIENT Became My Trojan Horse for E2E Testing

Remember my last confession about killing Fiori? Well, I'm back with something even more blasphemous.

I made ABAP do it for me. From the inside. As a regression suite.

## The "Wait, That's Illegal" Moment

Picture this: After months of capturing OData requests from the browser, I'm staring at transaction `/IWFND/GW_CLIENT` and it hits me like a ton of SE80 tabs:

**Why are we testing from the outside when the killer lives inside the house?**

GW_CLIENT isn't just a testing tool. It's literally the OData execution engine wrapped in a thin SAPGUI disguise. Every OData call you make? It goes through the same gateway runtime that GW_CLIENT uses.

The epiphany: My Chrome extension captures → GW_CLIENT replays → Pure ABAP orchestrates → E2E regression suite with zero frontend dependencies.

## What's Been Built Since "I Killed Fiori"

Since June, the extension evolved from a simple recorder to a full test orchestration platform:

### The Capture Evolution (Browser Side)
- **Audio narration**: Record your voice explaining what you're testing
- **Smart filtering**: Ignore the noise (no more favicon.ico in your tests)
- **Session correlation**: UI5 model metadata mapped to OData calls
- **Markdown generation**: Automatic documentation with sequence diagrams
- **ZIP packaging**: One-click export of entire test scenarios

### The Unholy Trinity: Browser → ABAP → AI

Here's where it gets spicy. Three-layer architecture that makes SAP Activate look like a suggestion:

**Layer 1: Browser Capture** (done ✓)
```javascript
// Every click, every request, every response
captureODataRequest(request) {
  return {
    uri: request.url,
    method: request.method,
    headers: request.headers,
    payload: request.body,
    response: response.data,
    ui5Context: extractUI5Metadata(),
    timestamp: Date.now()
  };
}
```

**Layer 2: ABAP Replay Engine** (the new killer feature)
```abap
METHOD execute_captured_session.
  DATA(lo_client) = /iwfnd/cl_sutil_client_proxy=>get_instance( ).

  LOOP AT mt_captured_requests INTO DATA(ls_request).
    " Direct gateway runtime execution - no UI needed
    lo_client->set_service( ls_request-service ).
    lo_client->set_request_uri( ls_request-uri ).
    lo_client->set_method( ls_request-method ).

    " Magic: Same authorization, same validation, zero browser
    lo_client->execute( ).

    validate_response(
      expected = ls_request-captured_response
      actual   = lo_client->get_response( )
    ).
  ENDLOOP.
ENDMETHOD.
```

**Layer 3: AI Orchestration** (because 2025)
- Natural language → Test scenarios
- "Update all vendor payment terms to NET30" → 47 OData calls → Done
- Claude reads the captured sessions and generates ABAP test classes

## The Architecture Nobody Saw Coming

```
Chrome Extension (Capture)
    ↓ [JSON/ZIP Export with screenshots & audio]
Z_FIORI_IMPORT (ABAP Program)
    ↓ [Parse & Store in custom tables]
Z_FIORI_TEST_SUITE (Test Double Framework)
    ↓ [Parametrization engine]
/IWFND/GW_CLIENT Runtime (Direct execution)
    ↓ [Same gateway, no browser]
Backend Logic (Untouched, tested, happy)
```

## The Numbers That Made SAP Consultants Cry

**Traditional Fiori E2E Testing:**
- Setup: 2-3 weeks + licenses for test tools
- Maintenance: 40% of test time (selectors break!)
- Browser dependency: 100% (Chrome v127.0.1.2 specifically)
- Flakiness: "It works on my machine"
- Speed: 3-5 seconds per click

**ABAP-Native Replay:**
- Setup: Import JSON, press F8
- Maintenance: Zero (it's just OData URIs)
- Browser dependency: 0%
- Flakiness: If ABAP fails, you have bigger problems
- Speed: Milliseconds (it's in-memory)

## The Part Where I Break eCATT (In The Best Way)

eCATT was never meant for this. But with a little `/IWFND/CL_CLIENT_PROXY` magic:

```abap
CLASS zcl_fiori_test_runner DEFINITION.
  PUBLIC SECTION.
    METHODS: import_browser_session
      IMPORTING iv_json TYPE string
      RETURNING VALUE(rv_test_id) TYPE sysuuid_x16.

    METHODS: execute_as_ecatt
      IMPORTING iv_test_id TYPE sysuuid_x16
                iv_variant TYPE etvar_id OPTIONAL.

  PRIVATE SECTION.
    METHODS: replay_via_gw_client
      IMPORTING is_request TYPE zfiori_captured_request
      RETURNING VALUE(rs_response) TYPE zfiori_response.
ENDCLASS.

CLASS zcl_fiori_test_runner IMPLEMENTATION.
  METHOD replay_via_gw_client.
    " This is where the magic happens
    " Direct call to gateway runtime - no HTTP, no browser
    CALL METHOD ('/IWFND/CL_MGW_REQUEST_MANAGER')=>handle_request
      EXPORTING
        io_request  = create_request_from_capture( is_request )
      IMPORTING
        eo_response = DATA(lo_response).

    rs_response = serialize_response( lo_response ).
  ENDMETHOD.
ENDCLASS.
```

Suddenly your eCATT scripts aren't clicking buttons. They're executing business logic directly.

## Real Implementation That's Running Right Now

```abap
REPORT zfiori_regression_suite.

PARAMETERS: p_sess TYPE string. " Captured session ID

START-OF-SELECTION.
  " Import the captured browser session
  DATA(lo_importer) = NEW zcl_fiori_session_importer( ).
  DATA(lt_requests) = lo_importer->import_from_extension( p_sess ).

  " Replay each request through GW_CLIENT runtime
  LOOP AT lt_requests INTO DATA(ls_request).
    TRY.
        " Execute via internal gateway - no HTTP overhead
        DATA(ls_response) = NEW /iwfnd/cl_gw_client(
          )->execute_request( ls_request ).

        " Validate business logic, not UI behavior
        IF ls_response-status <> ls_request-expected_status.
          MESSAGE |Regression detected: { ls_request-uri }| TYPE 'E'.
        ENDIF.

      CATCH cx_gateway_exception INTO DATA(lx_error).
        " Real errors, not "element not clickable"
        MESSAGE lx_error TYPE 'E'.
    ENDTRY.
  ENDLOOP.
```

## The Regression Suite That Builds Itself

1. **Monday**: Business user works normally in Fiori
2. **Extension**: Silently captures their entire session
3. **Tuesday 2 AM**: ABAP job imports yesterday's sessions
4. **Tuesday 2:01 AM**: Parametrizes and creates variants
5. **Tuesday 2:02 AM**: Replays everything via GW_CLIENT
6. **Tuesday 7 AM**: Coffee with zero regression bugs

**Cost:** $0
**Setup time:** 1 transport request
**Consultant tears:** Priceless
**Business user training:** "Just work normally"

## What About Security?

Same authorization checks. Same gateway validations. Same everything — minus the JavaScript circus.

If anything, it's MORE secure:
- No browser vulnerabilities
- No XSS possibilities
- No session hijacking
- Just pure ABAP executing in its natural habitat

Plus: Your test user needs the same authorizations as production. No more "it worked in test because TEST_USER had SAP_ALL".

## The Features That Ship While You Sleep

Since the original article, the community built:

### Parametrization Engine
```abap
" One recording, infinite variations
DATA(lo_params) = NEW zcl_test_parametrizer( ).
lo_params->add_rule(
  pattern = '/CompanyCode=''1000''/'
  parameter = 'BUKRS'
  test_data_table = 'ZTEST_COMPANIES'
).
```

### Intelligent Test Generation
```abap
" AI reads your captures and writes test classes
DATA(lo_ai) = NEW zcl_claude_test_writer( ).
lo_ai->analyze_session( ls_session ).
lo_ai->generate_test_class( ).  " Full ABAP OO test class
```

### Cross-System Replay
```abap
" Record in DEV, replay in QAS, validate in PRD
DATA(lo_replay) = NEW zcl_cross_system_replay( ).
lo_replay->set_source_session( DEV_session ).
lo_replay->execute_in_system( 'QAS' ).
```

## The Part SAP Doesn't Want You To Know

GW_CLIENT has been there since 2011. The gateway runtime is completely accessible via ABAP. We've been testing from the wrong side for 14 years.

Every Fiori app is just OData calls.
Every OData call is just ABAP.
Every ABAP program can call itself.

The circle is complete.

## Your Next Steps

1. **Install the extension** (5 minutes)
2. **Work normally** in Fiori (record real scenarios)
3. **Export sessions** as JSON
4. **Import to ABAP** via the included transport
5. **Schedule nightly replay** via SM37
6. **Sleep peacefully** knowing regression bugs are extinct

## What Breaks When You Test From Inside?

Nothing. That's the point.

The same backend that handles production traffic runs your tests. No mocking. No stubbing. No "test mode". Just pure business logic validation at the speed of ABAP.

## The Community Response

*"Wait, we can just... call GW_CLIENT programmatically?"* — Every ABAP developer

*"This killed our $200K/year test automation license"* — Fortune 500 company

*"But what about our 10,000 Selenium scripts?"* — Keep them as documentation of suffering

## What's Next?

The roadmap that will make traditional testing obsolete:

- **Direct CDS Test Generation**: Skip OData, test straight CDS views
- **AI-Powered Assertion Generation**: Claude writes your ASSERT statements
- **Automatic Variant Creation**: One recording → full boundary testing
- **Production Replay Mode**: Copy production requests for perfect regression tests

## The Code Is Live

Everything's in the repo. One transport away from killing your Fiori testing nightmare:

- Chrome extension: Captures everything
- ABAP import utility: Parses browser exports
- Test runner: Executes via GW_CLIENT
- eCATT integration: Makes it official
- Parametrization engine: One recording, infinite tests

## The Bottom Line

We've been testing UIs when we should be testing business logic.
We've been maintaining selectors when we should be maintaining test data.
We've been fighting browsers when ABAP had the answer all along.

The best test framework is the one that's already running your business logic.

The best UI is no UI.

The best test is no test — just validated replay of actual user work.

Time to go native. 🎯

---

**GitHub**: [github.com/oisee/fiori_automator](https://github.com/oisee/fiori_automator)
**Extension**: Chrome Web Store (search "Fiori Automator")
**ABAP Transport**: See `/abap_integration` in repo
**Original Article**: ["I Killed Fiori (And I'd Do It Again)"](https://www.linkedin.com/pulse/i-killed-fiori-id-do-again-alice-vinogradova-tbnjc/)

**Next**: "How I Made Claude Write ABAP (And It Liked It)"

*Got a Fiori app that needs killing? Drop it in the comments. First 10 get free ABAP transport requests.*