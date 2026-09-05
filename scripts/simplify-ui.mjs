const STYLE_MARKER = '/* simple-input-ui-v2 */';
const SCRIPT_MARKER = 'id="simple-input-ui-v2"';

const SIMPLE_STYLE = String.raw`
/* simple-input-ui-v2 */
#page-inputs .simple-context{padding:0;overflow:hidden;background:var(--paper)}
#page-inputs .simple-context>summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;list-style:none;font-size:14px;font-weight:750;min-height:0}
#page-inputs .simple-context>summary::-webkit-details-marker{display:none}
#page-inputs .simple-context>summary:after{content:'＋';font-size:20px;line-height:1;color:var(--muted);font-weight:400}
#page-inputs .simple-context[open]>summary:after{content:'−'}
#page-inputs .simple-context>summary small{display:block;margin-left:auto;color:var(--muted);font-size:11px;font-weight:450;text-align:right}
#page-inputs .simple-context>.simple-context-body{border-top:1px solid var(--line);padding:19px 20px 20px}
#page-inputs .simple-flow{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 18px;padding:12px 15px;border:1px solid #c6ded5;background:var(--teal-soft);border-radius:12px;color:var(--teal);font-size:12px}
#page-inputs .simple-flow strong{font-size:13px}
#page-inputs .simple-flow .arrow{opacity:.55}
#page-inputs .simple-section{border:1px solid var(--line);border-radius:13px;padding:18px;margin:15px 0;background:#fff}
#page-inputs .simple-section.core{background:#fcfdfb}
#page-inputs .simple-section.extra{background:#f8faf8}
#page-inputs .simple-section-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:15px}
#page-inputs .simple-step{display:inline-grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:999px;background:var(--ink);color:white;font-size:12px;font-weight:800}
#page-inputs .simple-section-head h4{font-size:16px;line-height:1.35;margin:1px 0 2px}
#page-inputs .simple-section-head p{font-size:12px;color:var(--muted);margin:0}
#page-inputs .simple-core-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
#page-inputs .simple-extra-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
#page-inputs .simple-extra-tranche{border-top:1px solid var(--line);padding-top:14px;margin-top:14px}
#page-inputs .simple-extra-tranche:first-of-type{border-top:0;padding-top:0;margin-top:0}
#page-inputs .simple-extra-title{font-size:12px;font-weight:700;color:var(--muted);margin-bottom:10px}
#page-inputs .simple-costs,#page-inputs .simple-rare{margin-top:13px;border-top:1px dashed var(--line);padding-top:10px}
#page-inputs .simple-costs>summary,#page-inputs .simple-rare>summary{font-size:12px;color:var(--muted);font-weight:650;min-height:32px}
#page-inputs .simple-costs>.grid,#page-inputs .simple-rare>.grid{margin-top:11px}
#page-inputs .simple-cost-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
#page-inputs .simple-rare-grid{grid-template-columns:minmax(0,1fr)}
#page-inputs .simple-core-grid .field label small,#page-inputs .simple-extra-grid .field label small{font-size:10.5px}
#page-inputs .simple-core-grid .field:has(input:disabled){opacity:.58}
#page-inputs .simple-advanced{margin-top:18px}
#page-inputs .offer-body>.offer-summary{margin-bottom:10px}
#page-inputs .tranche.simple-tranche{margin:12px 0;background:white}
#page-inputs .tranche.simple-tranche .grid{margin-top:0}
@media(max-width:900px){#page-inputs .simple-core-grid,#page-inputs .simple-extra-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){#page-inputs .simple-context>summary{align-items:flex-start;flex-direction:column;gap:2px}#page-inputs .simple-context>summary small{margin-left:0;text-align:left}#page-inputs .simple-context>summary:after{position:absolute;right:18px}#page-inputs .simple-context{position:relative}#page-inputs .simple-core-grid,#page-inputs .simple-extra-grid,#page-inputs .simple-cost-grid{grid-template-columns:1fr}#page-inputs .simple-section{padding:14px}}
`;

const SIMPLE_SCRIPT = String.raw`
<script id="simple-input-ui-v2">
(function(){
  'use strict';

  function directChild(root, selector){
    return Array.from(root.children).find(function(node){ return node.matches && node.matches(selector); }) || null;
  }

  function fieldByKey(root, key){
    var control = root.querySelector('[data-key="' + key + '"]');
    return control ? control.closest('.field') : null;
  }

  function makeContext(title, note, className){
    var details = document.createElement('details');
    details.className = 'panel simple-context ' + className;
    var summary = document.createElement('summary');
    var label = document.createElement('span');
    label.textContent = title;
    var small = document.createElement('small');
    small.textContent = note;
    summary.append(label, small);
    var body = document.createElement('div');
    body.className = 'simple-context-body';
    details.append(summary, body);
    return { details: details, body: body };
  }

  function simplifyPage(){
    var page = document.getElementById('page-inputs');
    if(!page || page.dataset.simplePage === 'v2') return;
    page.dataset.simplePage = 'v2';

    var tab = document.getElementById('tab-inputs');
    if(tab){
      var index = tab.querySelector('.index');
      tab.textContent = '';
      if(index) tab.appendChild(index);
      tab.appendChild(document.createTextNode('报价录入'));
    }

    var head = page.querySelector('.sectionhead');
    if(head){
      var h2 = head.querySelector('h2');
      var p = head.querySelector('p');
      if(h2) h2.textContent = '每个报价，只填两类信息';
      if(p) p.textContent = '① 贷款主体：真正改变还款路径与融资成本的参数。② 附加条款：Sondertilgung、调整权限、Bereitstellung 等。';
    }

    var projectFields = document.getElementById('project-fields');
    var projectPanel = projectFields ? projectFields.closest('.panel') : null;
    var projectDetails = null;
    if(projectPanel && !projectPanel.classList.contains('simple-context')){
      var project = makeContext('共同购房背景（只填一次）','首次录入时核对；之后主要比较下面两类报价参数','simple-project');
      var projectH3 = directChild(projectPanel,'h3');
      if(projectH3) projectH3.remove();
      while(projectPanel.firstChild) project.body.appendChild(projectPanel.firstChild);
      projectPanel.replaceWith(project.details);
      projectDetails = project.details;
    }

    var compareFields = document.getElementById('compare-fields');
    var comparePanel = compareFields ? compareFields.closest('.panel') : null;
    var compareDetails = null;
    if(comparePanel && !comparePanel.classList.contains('simple-context')){
      var advanced = makeContext('高级比较假设（可选）','统一月供、实际额外还款预算和续贷假设，不属于银行报价主体','simple-advanced');
      var compareH3 = directChild(comparePanel,'h3');
      if(compareH3) compareH3.remove();
      while(comparePanel.firstChild) advanced.body.appendChild(comparePanel.firstChild);
      comparePanel.replaceWith(advanced.details);
      compareDetails = advanced.details;
    }

    var guide = document.createElement('div');
    guide.className = 'simple-flow';
    guide.innerHTML = '<strong>主流程</strong><span>1 · 贷款主体</span><span class="arrow">→</span><span>2 · 附加条款</span><span class="arrow">→</span><span>直接去“报价对比”看结果</span>';
    if(projectDetails) projectDetails.after(guide);
    else if(head) head.after(guide);

    if(compareDetails){
      var add = document.getElementById('add-offer');
      var foot = add ? add.nextElementSibling : null;
      if(foot) foot.after(compareDetails);
      else if(add) add.after(compareDetails);
    }
  }

  function sectionHead(step, title, text){
    var head = document.createElement('div');
    head.className = 'simple-section-head';
    head.innerHTML = '<span class="simple-step">' + step + '</span><div><h4>' + title + '</h4><p>' + text + '</p></div>';
    return head;
  }

  function simplifyOffer(card){
    if(!card || card.dataset.simpleOffer === 'v2') return;
    card.dataset.simpleOffer = 'v2';

    var body = card.querySelector('.offer-body');
    if(!body) return;
    var offerSummary = directChild(body,'.offer-summary');
    var tranches = Array.from(body.children).filter(function(node){ return node.classList && node.classList.contains('tranche'); });
    var actionRows = Array.from(body.children).filter(function(node){ return node.classList && node.classList.contains('actions'); });
    var trancheActions = actionRows.length ? actionRows[0] : null;
    var originalDetails = directChild(body,'details');
    var status = Array.from(body.children).find(function(node){ return node.id && node.id.indexOf('offer-status-') === 0; }) || null;

    var core = document.createElement('section');
    core.className = 'simple-section core';
    core.appendChild(sectionHead('1','贷款主体','本金、Sollzins、锁息期与月供／初始还款率决定还款路径；已知融资费用也计入成本。'));

    var extra = document.createElement('section');
    extra.className = 'simple-section extra';
    extra.appendChild(sectionHead('2','附加条款','重点看每年额外还款额度、Tilgung 调整、Bereitstellung 和退出限制。'));

    var extraFields = [];
    tranches.forEach(function(tranche, index){
      tranche.classList.add('simple-tranche');
      var grid = tranche.querySelector('.grid');
      if(grid){
        grid.classList.remove('five');
        grid.classList.add('simple-core-grid');
      }

      var extraBox = document.createElement('div');
      extraBox.className = 'simple-extra-tranche';
      var title = document.createElement('div');
      title.className = 'simple-extra-title';
      var nameInput = tranche.querySelector('.tranchehead input[data-key="name"]');
      title.textContent = tranches.length > 1 ? ('第 ' + (index + 1) + ' 笔 · ' + (nameInput ? nameInput.value : '贷款')) : '本笔贷款的附加条款';
      var extraGrid = document.createElement('div');
      extraGrid.className = 'grid simple-extra-grid';
      ['effective','specialPct'].forEach(function(key){
        var field = fieldByKey(tranche,key);
        if(field) extraGrid.appendChild(field);
      });
      extraBox.append(title, extraGrid);
      extraFields.push(extraBox);

      var grace = fieldByKey(tranche,'graceMonths');
      if(grace){
        var rare = document.createElement('details');
        rare.className = 'simple-rare';
        var rareSummary = document.createElement('summary');
        rareSummary.textContent = '特殊还款结构：最初只付息月数';
        var rareGrid = document.createElement('div');
        rareGrid.className = 'grid simple-rare-grid';
        rareGrid.appendChild(grace);
        rare.append(rareSummary, rareGrid);
        tranche.appendChild(rare);
      }

      core.appendChild(tranche);
    });

    if(trancheActions) core.appendChild(trancheActions);

    var termsGrid = originalDetails ? originalDetails.querySelector('.grid') : null;
    if(termsGrid){
      var costs = document.createElement('details');
      costs.className = 'simple-costs';
      var costsSummary = document.createElement('summary');
      costsSummary.textContent = '会计入融资成本的额外费用（没有就保持 0）';
      var costsGrid = document.createElement('div');
      costsGrid.className = 'grid simple-cost-grid';
      ['fees','commitment'].forEach(function(key){
        var field = fieldByKey(termsGrid,key);
        if(field) costsGrid.appendChild(field);
      });
      if(costsGrid.children.length){
        costs.append(costsSummary,costsGrid);
        core.appendChild(costs);
      }
    }

    extraFields.forEach(function(node){ extra.appendChild(node); });

    if(termsGrid){
      var offerExtraGrid = document.createElement('div');
      offerExtraGrid.className = 'grid simple-extra-grid';
      ['freeMonths','commitmentRate','penalty','flexibility','notes'].forEach(function(key){
        var field = fieldByKey(termsGrid,key);
        if(field) offerExtraGrid.appendChild(field);
      });
      if(offerExtraGrid.children.length) extra.appendChild(offerExtraGrid);
    }

    if(originalDetails) originalDetails.remove();
    if(offerSummary) offerSummary.after(core);
    else body.prepend(core);
    core.after(extra);
    if(status) body.appendChild(status);
  }

  function simplifyOffers(){
    document.querySelectorAll('#offer-editors .offer-card').forEach(simplifyOffer);
  }

  function start(){
    simplifyPage();
    simplifyOffers();
    var editor = document.getElementById('offer-editors');
    if(editor){
      new MutationObserver(function(){ simplifyOffers(); }).observe(editor,{childList:true});
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
</script>
`;

export function applySimplifiedUi(html){
  if(typeof html !== 'string' || !html.includes('<html')) throw new Error('simplify-ui: expected calculator HTML.');
  if(html.includes(SCRIPT_MARKER)) return html;
  if(!html.includes('</style>')) throw new Error('simplify-ui: closing style tag not found.');
  if(!html.includes('</body>')) throw new Error('simplify-ui: closing body tag not found.');
  let output = html.replace('</style>', SIMPLE_STYLE + '\n</style>');
  output = output.replace('</body>', SIMPLE_SCRIPT + '\n</body>');
  if(!output.includes(STYLE_MARKER) || !output.includes(SCRIPT_MARKER)) throw new Error('simplify-ui: injection failed.');
  return output;
}
