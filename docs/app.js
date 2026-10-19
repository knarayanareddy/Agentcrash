/* Playground UI. All decisions below are computed by docs/saaf-guard.js,
   which is the shipped src/lib code bundled unchanged. */
(function () {
  "use strict";

  var S = window.SAAF;
  if (!S) {
    document.getElementById("pg-result").innerHTML =
      '<div class="verdict">Guard bundle failed to load.</div>';
    return;
  }

  var elTicket = document.getElementById("pg-ticket");
  var elAmount = document.getElementById("pg-amount");
  var elTool = document.getElementById("pg-tool");
  var elRefs = document.getElementById("pg-refs");
  var elHalt = document.getElementById("pg-halt");
  var elFacts = document.getElementById("pg-facts");
  var elResult = document.getElementById("pg-result");

  /* ---- populate tickets ------------------------------------------------ */
  S.TICKET_FIXTURES.forEach(function (f) {
    var o = document.createElement("option");
    o.value = f.ticketId;
    o.textContent = f.ticketId + " — " + f.label;
    elTicket.appendChild(o);
  });

  function selectedFixture() {
    return S.getTicketFixture(elTicket.value);
  }

  elTicket.addEventListener("change", function () {
    var f = selectedFixture();
    if (!f) return;
    elAmount.value = (f.orderTotalCents / 100).toFixed(2);
    elRefs.value = f.evidenceRefs.map(function (r) { return r.refId; }).join(", ");
    run();
  });

  /* ---- policy provenance + rules table -------------------------------- */
  var prov = S.demoPolicyProvenance();
  document.getElementById("provenance").textContent =
    prov.policyId + "  v" + prov.version + "  effective " + prov.effectiveDate + "\n" +
    "canonical " + prov.canonicalHash + "\n" +
    prov.entity + "\n" + prov.syntheticNotice;

  var tbody = document.querySelector("#rules tbody");
  S.DEMO_POLICY.rules.forEach(function (r) {
    var tr = document.createElement("tr");
    var tdId = document.createElement("td");
    tdId.innerHTML = "<code>" + r.id + "</code><br><span class='dim'>" + r.title + "</span>";
    var tdDisp = document.createElement("td");
    tdDisp.className = r.disposition === "BLOCK" ? "bad" : "warn";
    tdDisp.textContent = r.disposition;
    var tdClause = document.createElement("td");
    tdClause.textContent = r.clause;
    tr.appendChild(tdId); tr.appendChild(tdDisp); tr.appendChild(tdClause);
    tbody.appendChild(tr);
  });

  /* ---- rendering ------------------------------------------------------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function eur(cents) { return "€" + (cents / 100).toFixed(2); }

  function run() {
    var f = selectedFixture();
    if (!f) return;

    var amountCents = Math.round(parseFloat(elAmount.value || "0") * 100);
    if (!isFinite(amountCents) || amountCents < 0) amountCents = 0;
    var tool = elTool.value;
    var refs = elRefs.value.split(",")
      .map(function (s) { return s.trim().toUpperCase(); })
      .filter(function (s) { return s.length > 0; });
    var env = elHalt.checked ? { SAAF_HALT_ALL_TOOL_ACTIONS: "1" } : {};

    var signals = S.scanCustomerMessage(f.defaultCustomerMessage || "");
    var verified = f.evidenceRefs.filter(function (r) { return r.status === "verified"; })
      .map(function (r) { return r.refId; });
    var allRefs = f.evidenceRefs.map(function (r) { return r.refId; });

    var input = {
      orderTotalCents: f.orderTotalCents,
      claimType: f.claimType,
      verifiedEvidenceRefs: verified,
      allEvidenceRefs: allRefs,
      reviewThreatOnTicket: f.reviewThreatOnTicket,
      threatMarkers: signals.threatMarkers,
      proposedAmountCents: amountCents,
      citedEvidenceRefs: refs
    };

    var guard = S.evaluatePolicyGuard(input);
    var cap = S.evaluateCapability(tool, env);

    var verdict;
    if (guard.disposition === "BLOCK") verdict = "BLOCKED_BY_POLICY_GUARD";
    else if (!cap.allowed) verdict = "BLOCKED_BY_POLICY_GUARD";
    else if (guard.disposition === "REVIEW") verdict = "ROUTE_TO_HUMAN";
    else verdict = "ALLOW";

    var response = S.approvedCustomerResponse({
      verdict: verdict,
      blockingRuleIds: guard.blockingRuleIds,
      reviewRuleIds: guard.reviewRuleIds,
      approvedAmountCents: verdict === "ALLOW" ? amountCents : null,
      ticketId: f.ticketId
    });

    /* trusted facts panel */
    elFacts.innerHTML =
      "<b>" + esc(f.ticketId) + "</b> · " + esc(f.claimType) + "\n" +
      "order total      " + eur(f.orderTotalCents) + "\n" +
      "evidence         " + (f.evidenceRefs.map(function (r) {
        return r.refId + " (" + r.status + ")";
      }).join(", ") || "none") + "\n" +
      "threat on ticket " + f.reviewThreatOnTicket + "\n" +
      "cap              " + eur(S.DEMO_POLICY.unapprovedCapCents) +
      "   allowlist: " + S.TOOL_ALLOWLIST.join(", ");

    /* result */
    var html = "";

    html += '<div class="verdict"><div class="vhead">' +
      '<span class="pill ' + guard.disposition + '">guard ' + guard.disposition + "</span>" +
      '<span class="pill ' + verdict + '">' + verdict + "</span>" +
      '<span class="dim" style="font-size:13px">' + esc(guard.reason) + "</span>" +
      "</div>";

    if (guard.findings.length === 0) {
      html += '<div class="dim" style="font-size:14px">No rule fired.</div>';
    } else {
      html += "<ul class='findings'>";
      guard.findings.forEach(function (fnd) {
        var rule = S.ruleById(fnd.ruleId);
        html += "<li class='" + fnd.disposition + "'>" +
          "<span class='rid'>" + esc(fnd.ruleId) + "</span>" +
          "<span class='disp " + fnd.disposition + "'>" + fnd.disposition + "</span>" +
          "<span class='clause'>" + esc(fnd.detail) + "</span>" +
          (rule ? "<span class='clause dim'>\"" + esc(rule.clause) + '"</span>' : "") +
          "</li>";
      });
      html += "</ul>";
    }
    html += "</div>";

    html += '<div class="verdict"><h4>Capability</h4>' +
      "<div style='font-family:ui-monospace,Menlo,monospace;font-size:13.5px'>" +
      esc(cap.attemptedTool) + " → " +
      (cap.allowed
        ? '<span class="ok">ALLOWED</span>'
        : '<span class="bad">DENIED</span>') +
      " <span class='dim'>(" + esc(cap.reason) + ")</span></div>" +
      (cap.deniedCapabilities.length
        ? "<div class='dim' style='font-size:13px;margin-top:6px'>denied: " +
          esc(cap.deniedCapabilities.join(", ")) + "</div>"
        : "") +
      "</div>";

    html += '<div class="reply"><div class="tmpl">' + esc(response.templateId) +
      (response.policyClauseIds.length
        ? " · clauses " + esc(response.policyClauseIds.join(", "))
        : " · no policy clause cited") +
      "</div><p>" + esc(response.text) + "</p></div>";

    if (verdict === "ALLOW") {
      html += '<div class="verdict" style="margin-top:14px;border-color:var(--green)">' +
        '<h4>Side effect</h4><div style="font-size:14px">The server would commit <b>' +
        eur(amountCents) + "</b> to the mock ledger. " +
        '<span class="dim">This page commits nothing — there is no database here.</span></div></div>';
    } else {
      html += '<div class="verdict" style="margin-top:14px"><h4>Side effect</h4>' +
        '<div style="font-size:14px" class="dim">None. No ledger entry on this path.</div></div>';
    }

    elResult.innerHTML = html;
  }

  document.getElementById("pg-run").addEventListener("click", run);
  [elAmount, elTool, elRefs, elHalt].forEach(function (el) {
    el.addEventListener("change", run);
    el.addEventListener("input", function () { if (el.type !== "text") run(); });
  });

  run();
})();
