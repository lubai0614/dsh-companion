/**
 * 浏览器半：设置 → 角色世界（三页）。
 * 形态对齐大肥鱼生活：window.__ModuleLoader__ + settings.section。
 */
window.__ModuleLoader__.load({
  id: 'dsh-companion',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const API = '/api/dsh-companion';
    const LOADING_MIN_MS = 500;

    const asJson = async (res) => {
      if (res.ok) return res.json();
      let reason = '';
      try {
        const detail = await res.json();
        if (detail && typeof detail.error === 'string') reason = detail.error.slice(0, 160);
      } catch {
        /* ignore */
      }
      throw new Error('HTTP ' + res.status + (reason ? '：' + reason : ''));
    };

    const jget = async (p) => asJson(await fetch(API + p, { credentials: 'same-origin' }));
    const jpost = async (p, body) =>
      asJson(
        await fetch(API + p, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body || {}),
        }),
      );

    async function withMinLoading(work) {
      const t0 = Date.now();
      try {
        return await work();
      } finally {
        const wait = Math.max(0, LOADING_MIN_MS - (Date.now() - t0));
        if (wait) await new Promise((r) => setTimeout(r, wait));
      }
    }

    const CSS = `
[data-dc-page]{display:flex;flex-direction:column;gap:14px;padding:2px 2px 12px;max-width:980px;width:100%;}
[data-dc-tabs]{display:flex;gap:6px;flex-wrap:wrap;}
[data-dc-tab]{padding:7px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;
  border:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.25));
  background:transparent;color:inherit;}
[data-dc-tab][data-on]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.2));font-weight:600;}
[data-dc-card]{position:relative;display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:10px;
  border:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.22));
  background:var(--dsw-alias-bg-layer-4,rgba(128,128,128,.08));}
[data-dc-h]{font-size:13px;font-weight:600;}
[data-dc-note]{font-size:11px;line-height:1.4;color:var(--dsw-alias-label-tertiary,#9aa0a6);}
[data-dc-row]{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
[data-dc-input],[data-dc-select]{padding:6px 8px;border-radius:8px;font-size:12px;font-family:inherit;color:inherit;
  border:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.25));
  background:var(--dsw-alias-bg-layer-4,rgba(128,128,128,.1));}
[data-dc-btn]{padding:7px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;
  border:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.28));
  background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18));color:inherit;}
[data-dc-btn][disabled]{opacity:.45;cursor:default;}
[data-dc-btn][data-primary]{background:#3b82f6;border-color:#3b82f6;color:#fff;}
[data-dc-table]{width:100%;border-collapse:collapse;font-size:12px;}
[data-dc-table] th,[data-dc-table] td{padding:6px 8px;border-bottom:1px solid var(--dsw-alias-bg-layer-3,rgba(128,128,128,.18));
  text-align:left;vertical-align:top;word-break:break-word;}
[data-dc-table] th{font-weight:600;color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:11px;}
[data-dc-msg]{font-size:12px;}
[data-dc-msg][data-err]{color:#ef4444;}
[data-dc-msg][data-ok]{color:#22c55e;}
[data-dc-mask]{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;
  background:rgba(0,0,0,.28);border-radius:10px;z-index:2;font-size:12px;}
[data-dc-badge]{display:inline-block;padding:1px 6px;border-radius:999px;font-size:10px;
  background:rgba(128,128,128,.2);}
[data-dc-pre]{white-space:pre-wrap;font-size:11px;line-height:1.45;margin:0;max-height:220px;overflow:auto;}
`;

    function ensureCss() {
      if (document.getElementById('dsh-companion-settings-css')) return;
      const el = document.createElement('style');
      el.id = 'dsh-companion-settings-css';
      el.textContent = CSS;
      document.head.appendChild(el);
    }

    function Card({ title, note, loading, children }) {
      return h(
        'section',
        { 'data-dc-card': '' },
        loading
          ? h('div', { 'data-dc-mask': '' }, '处理中…')
          : null,
        title ? h('div', { 'data-dc-h': '' }, title) : null,
        note ? h('div', { 'data-dc-note': '' }, note) : null,
        children,
      );
    }

    function Pager({ page, pages, onChange, disabled }) {
      return h(
        'div',
        { 'data-dc-row': '' },
        h(
          'button',
          {
            'data-dc-btn': '',
            disabled: disabled || page <= 1,
            onClick: () => onChange(page - 1),
          },
          '上一页',
        ),
        h('span', { 'data-dc-note': '' }, `${page} / ${pages}`),
        h(
          'button',
          {
            'data-dc-btn': '',
            disabled: disabled || page >= pages,
            onClick: () => onChange(page + 1),
          },
          '下一页',
        ),
      );
    }

    function MemoryPage() {
      const [busy, setBusy] = useState(false);
      const [msg, setMsg] = useState(null);
      const [meta, setMeta] = useState(null);
      const [ltm, setLtm] = useState(null);
      const [near, setNear] = useState(null);
      const [trace, setTrace] = useState(null);
      const [nearKind, setNearKind] = useState('fragment');
      const [ltmQ, setLtmQ] = useState({ platform: '', peer_id: '', kind: '', source: '', q: '', page: 1 });
      const [nearQ, setNearQ] = useState({
        platform: '',
        peer_id: '',
        source: '',
        q: '',
        from: '',
        to: '',
        page: 1,
      });
      const [weightDraft, setWeightDraft] = useState({});

      const loadAll = useCallback(
        async (ltmPatch, nearPatch, kind) => {
          setBusy(true);
          setMsg(null);
          const nextLtm = { ...ltmQ, ...(ltmPatch || {}) };
          const nextNear = { ...nearQ, ...(nearPatch || {}) };
          const nk = kind || nearKind;
          try {
            await withMinLoading(async () => {
              const qs = (obj) =>
                Object.entries(obj)
                  .filter(([, v]) => v != null && String(v) !== '')
                  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                  .join('&');
              const [m, l, n, t] = await Promise.all([
                jget('/memory/meta'),
                jget('/memory/ltm?' + qs(nextLtm)),
                jget('/memory/near?' + qs({ ...nextNear, near_kind: nk })),
                jget('/trace/last'),
              ]);
              if (!l.ok) throw new Error(l.error || '长期列表失败');
              if (!n.ok) throw new Error(n.error || '近因列表失败');
              setMeta(m);
              setLtm(l);
              setNear(n);
              setTrace(t);
              setLtmQ(nextLtm);
              setNearQ(nextNear);
              setNearKind(nk);
            });
          } catch (e) {
            setMsg({ err: true, text: String(e.message || e) });
          } finally {
            setBusy(false);
          }
        },
        [ltmQ, nearQ, nearKind],
      );

      useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const peers = meta?.peers || [];

      const onAdjust = async (id) => {
        const w = weightDraft[id];
        setBusy(true);
        setMsg(null);
        try {
          await withMinLoading(async () => {
            const out = await jpost('/memory/weight', { id, weight: w });
            if (!out.ok) throw new Error(out.error || '调权失败');
            setMsg({ err: false, text: out.message || '已调权' });
            await loadAll({ page: ltm?.page || 1 });
          });
        } catch (e) {
          setMsg({ err: true, text: String(e.message || e) });
        } finally {
          setBusy(false);
        }
      };

      return h(
        'div',
        null,
        msg
          ? h('div', { 'data-dc-msg': '', 'data-err': msg.err ? '' : undefined, 'data-ok': msg.err ? undefined : '' }, msg.text)
          : null,
        h(
          Card,
          { title: '长期记忆', note: '正文只读；仅可调权重。', loading: busy },
          h(
            'div',
            { 'data-dc-row': '' },
            h(
              'select',
              {
                'data-dc-select': '',
                value: ltmQ.platform && ltmQ.peer_id ? `${ltmQ.platform}::${ltmQ.peer_id}` : '',
                onChange: (e) => {
                  const v = e.target.value;
                  if (!v) setLtmQ((s) => ({ ...s, platform: '', peer_id: '', page: 1 }));
                  else {
                    const [platform, peer_id] = v.split('::');
                    setLtmQ((s) => ({ ...s, platform, peer_id, page: 1 }));
                  }
                },
              },
              h('option', { value: '' }, '全部对象'),
              peers.map((p) =>
                h('option', { key: p.label, value: `${p.platform}::${p.peer_id}` }, p.label),
              ),
            ),
            h(
              'select',
              {
                'data-dc-select': '',
                value: ltmQ.kind,
                onChange: (e) => setLtmQ((s) => ({ ...s, kind: e.target.value, page: 1 })),
              },
              h('option', { value: '' }, '全部类型'),
              (meta?.kinds || []).map((k) => h('option', { key: k.id, value: k.id }, k.title)),
            ),
            h(
              'select',
              {
                'data-dc-select': '',
                value: ltmQ.source,
                onChange: (e) => setLtmQ((s) => ({ ...s, source: e.target.value, page: 1 })),
              },
              h('option', { value: '' }, '全部来源'),
              (meta?.sources || []).map((k) => h('option', { key: k.id, value: k.id }, k.title)),
            ),
            h('input', {
              'data-dc-input': '',
              placeholder: '关键词',
              value: ltmQ.q,
              onChange: (e) => setLtmQ((s) => ({ ...s, q: e.target.value })),
            }),
            h(
              'button',
              { 'data-dc-btn': '', 'data-primary': '', disabled: busy, onClick: () => loadAll({ page: 1 }) },
              '查询',
            ),
          ),
          h(
            'table',
            { 'data-dc-table': '' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                ['编号', '对象', '类型', '来源', '发生', '记入', '权重', '正文', '变更', '操作'].map((t) =>
                  h('th', { key: t }, t),
                ),
              ),
            ),
            h(
              'tbody',
              null,
              (ltm?.rows || []).map((r) =>
                h(
                  'tr',
                  { key: r.id },
                  h('td', null, String(r.id).slice(0, 8)),
                  h('td', null, r.peer_label),
                  h('td', null, r.kind_zh),
                  h('td', null, r.source_zh),
                  h('td', null, r.event_at_display),
                  h('td', null, r.created_at_display),
                  h(
                    'td',
                    null,
                    String(r.weight),
                    r.faded ? h('span', { 'data-dc-badge': '' }, '已淡') : null,
                  ),
                  h('td', null, r.content),
                  h('td', null, r.change_note || '—'),
                  h(
                    'td',
                    null,
                    h('input', {
                      'data-dc-input': '',
                      style: { width: 64 },
                      value: weightDraft[r.id] ?? String(r.weight),
                      onChange: (e) =>
                        setWeightDraft((s) => ({ ...s, [r.id]: e.target.value })),
                    }),
                    h(
                      'button',
                      {
                        'data-dc-btn': '',
                        disabled: busy,
                        onClick: () => onAdjust(r.id),
                      },
                      '调权',
                    ),
                  ),
                ),
              ),
            ),
          ),
          h(Pager, {
            page: ltm?.page || 1,
            pages: ltm?.pages || 1,
            disabled: busy,
            onChange: (p) => loadAll({ page: p }),
          }),
        ),
        h(
          Card,
          { title: '近因', note: '片段 / 日摘；正文只读。', loading: busy },
          h(
            'div',
            { 'data-dc-row': '' },
            h(
              'button',
              {
                'data-dc-tab': '',
                'data-on': nearKind === 'fragment' ? '' : undefined,
                disabled: busy,
                onClick: () => loadAll(null, { page: 1 }, 'fragment'),
              },
              '片段',
            ),
            h(
              'button',
              {
                'data-dc-tab': '',
                'data-on': nearKind === 'digest' ? '' : undefined,
                disabled: busy,
                onClick: () => loadAll(null, { page: 1 }, 'digest'),
              },
              '日摘',
            ),
            h('input', {
              'data-dc-input': '',
              placeholder: '关键词',
              value: nearQ.q,
              onChange: (e) => setNearQ((s) => ({ ...s, q: e.target.value })),
            }),
            h('input', {
              'data-dc-input': '',
              type: 'date',
              value: nearQ.from,
              onChange: (e) => setNearQ((s) => ({ ...s, from: e.target.value })),
            }),
            h('input', {
              'data-dc-input': '',
              type: 'date',
              value: nearQ.to,
              onChange: (e) => setNearQ((s) => ({ ...s, to: e.target.value })),
            }),
            h(
              'button',
              {
                'data-dc-btn': '',
                'data-primary': '',
                disabled: busy,
                onClick: () => loadAll(null, { page: 1 }),
              },
              '查询',
            ),
          ),
          h(
            'table',
            { 'data-dc-table': '' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                (nearKind === 'fragment'
                  ? ['编号', '对象', '来源', '自然日', '写入', '正文']
                  : ['编号', '对象', '来源', '自然日', '首次', '末次覆盖', '正文']
                ).map((t) => h('th', { key: t }, t)),
              ),
            ),
            h(
              'tbody',
              null,
              (near?.rows || []).map((r) =>
                h(
                  'tr',
                  { key: r.id },
                  h('td', null, String(r.id).slice(0, 8)),
                  h('td', null, r.peer_label),
                  h('td', null, r.source_zh),
                  h('td', null, r.day_key),
                  h('td', null, r.created_at_display),
                  nearKind === 'digest' ? h('td', null, r.updated_at_display || '—') : null,
                  h('td', null, r.content),
                ),
              ),
            ),
          ),
          h(Pager, {
            page: near?.page || 1,
            pages: near?.pages || 1,
            disabled: busy,
            onChange: (p) => loadAll(null, { page: p }),
          }),
        ),
        h(
          Card,
          { title: '最近一次召回', note: '只看想起侧条目与原因；不做装配全文回放。', loading: busy },
          trace?.empty || !trace?.trace
            ? h('div', { 'data-dc-note': '' }, '尚无召回记录')
            : h(
                'div',
                null,
                h('div', { 'data-dc-note': '' }, `保存于 ${trace.saved_at_display || '—'}`),
                h('pre', { 'data-dc-pre': '' }, JSON.stringify(trace.trace, null, 2)),
              ),
        ),
      );
    }

    function ConfigPage() {
      const [busy, setBusy] = useState(false);
      const [msg, setMsg] = useState(null);
      const [data, setData] = useState(null);
      const [draft, setDraft] = useState({});
      const [collapsed, setCollapsed] = useState({});

      const load = useCallback(async () => {
        setBusy(true);
        setMsg(null);
        try {
          await withMinLoading(async () => {
            const out = await jget('/config');
            if (!out.ok) throw new Error(out.error || '读取失败');
            setData(out);
            const d = {};
            for (const it of out.items || []) d[it.key] = it.value;
            setDraft(d);
            const c = {};
            for (const g of out.groups || []) {
              if (g.collapsed) c[g.id] = true;
            }
            setCollapsed((prev) => ({ ...c, ...prev }));
          });
        } catch (e) {
          setMsg({ err: true, text: String(e.message || e) });
        } finally {
          setBusy(false);
        }
      }, []);

      useEffect(() => {
        load();
      }, [load]);

      const saveGroup = async (group) => {
        setBusy(true);
        setMsg(null);
        try {
          await withMinLoading(async () => {
            const patch = {};
            for (const key of group.keys) {
              const meta = (data.items || []).find((i) => i.key === key);
              if (meta?.readonly) continue;
              patch[key] = draft[key];
            }
            const out = await jpost('/config', patch);
            if (!out.ok) throw new Error(out.error || '保存失败');
            setMsg({ err: false, text: out.message || '已保存' });
            await load();
          });
        } catch (e) {
          setMsg({ err: true, text: '保存失败：' + String(e.message || e) });
        } finally {
          setBusy(false);
        }
      };

      const byKey = Object.fromEntries((data?.items || []).map((i) => [i.key, i]));

      return h(
        'div',
        null,
        msg
          ? h('div', { 'data-dc-msg': '', 'data-err': msg.err ? '' : undefined, 'data-ok': msg.err ? undefined : '' }, msg.text)
          : null,
        (data?.groups || []).map((g) => {
          const isCollapsed = Boolean(collapsed[g.id]);
          return h(
            Card,
            {
              key: g.id,
              title: g.title,
              note: g.desc,
              loading: busy,
            },
            g.collapsible
              ? h(
                  'button',
                  {
                    'data-dc-btn': '',
                    onClick: () => setCollapsed((s) => ({ ...s, [g.id]: !s[g.id] })),
                  },
                  isCollapsed ? '展开' : '收起',
                )
              : null,
            isCollapsed
              ? null
              : h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                  g.keys.map((key) => {
                    const it = byKey[key];
                    if (!it) return null;
                    return h(
                      'div',
                      { key, 'data-dc-row': '' },
                      h('label', { style: { minWidth: 180, fontSize: 12 } }, it.label),
                      h('input', {
                        'data-dc-input': '',
                        disabled: it.readonly || busy,
                        value: draft[key] ?? '',
                        onChange: (e) => setDraft((s) => ({ ...s, [key]: e.target.value })),
                      }),
                      h('span', { 'data-dc-note': '' }, it.explain || ''),
                    );
                  }),
                  h(
                    'button',
                    {
                      'data-dc-btn': '',
                      'data-primary': '',
                      disabled: busy,
                      onClick: () => saveGroup(g),
                    },
                    '保存',
                  ),
                ),
          );
        }),
      );
    }

    function SchedPage() {
      const [busy, setBusy] = useState(false);
      const [msg, setMsg] = useState(null);
      const [status, setStatus] = useState(null);
      const [runs, setRuns] = useState(null);
      const [task, setTask] = useState('digest');
      const [dayDraft, setDayDraft] = useState({});
      const [from, setFrom] = useState('');
      const [to, setTo] = useState('');

      const load = useCallback(
        async (taskId, page) => {
          setBusy(true);
          setMsg(null);
          const t = taskId || task;
          try {
            await withMinLoading(async () => {
              const qs = new URLSearchParams({
                task: t,
                page: String(page || runs?.page || 1),
                pageSize: '10',
              });
              if (from) qs.set('from', from);
              if (to) qs.set('to', to);
              const [st, list] = await Promise.all([
                jget('/sched/status'),
                jget('/sched/runs?' + qs.toString()),
              ]);
              if (!st.ok) throw new Error(st.error || '状态失败');
              if (!list.ok) throw new Error(list.error || '列表失败');
              setStatus(st);
              setRuns(list);
              setTask(t);
              const days = {};
              for (const card of st.tasks || []) {
                if (card.needsDay) days[card.id] = card.defaultDay || '';
              }
              setDayDraft((prev) => ({ ...days, ...prev }));
            });
          } catch (e) {
            setMsg({ err: true, text: String(e.message || e) });
          } finally {
            setBusy(false);
          }
        },
        [task, runs?.page, from, to],
      );

      useEffect(() => {
        load('digest', 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const start = async (id) => {
        setBusy(true);
        setMsg(null);
        try {
          await withMinLoading(async () => {
            const body = { task: id };
            if (dayDraft[id]) body.day_key = dayDraft[id];
            const out = await jpost('/sched/start', body);
            if (!out.ok) throw new Error(out.message || out.error || '启动失败');
            setMsg({ err: false, text: out.message || '已接受' });
            await load(task, 1);
          });
        } catch (e) {
          setMsg({ err: true, text: String(e.message || e) });
        } finally {
          setBusy(false);
        }
      };

      const abandon = async () => {
        setBusy(true);
        setMsg(null);
        try {
          await withMinLoading(async () => {
            const out = await jpost('/sched/abandon', {});
            if (!out.ok) throw new Error(out.error || '解除失败');
            setMsg({ err: false, text: out.message || '已解除' });
            await load(task, 1);
          });
        } catch (e) {
          setMsg({ err: true, text: String(e.message || e) });
        } finally {
          setBusy(false);
        }
      };

      return h(
        'div',
        null,
        msg
          ? h('div', { 'data-dc-msg': '', 'data-err': msg.err ? '' : undefined, 'data-ok': msg.err ? undefined : '' }, msg.text)
          : null,
        h(
          Card,
          {
            title: '调度',
            note: status?.plugin_tick?.hint || '',
            loading: busy,
          },
          h(
            'button',
            { 'data-dc-btn': '', disabled: busy, onClick: abandon },
            '解除卡住',
          ),
        ),
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 } },
          (status?.tasks || []).map((card) =>
            h(
              Card,
              {
                key: card.id,
                title: card.title,
                note: `钟点 ${card.time} · ${card.status_zh}`,
                loading: busy,
              },
              h('div', { 'data-dc-note': '' }, card.note),
              h(
                'div',
                { 'data-dc-note': '' },
                `最近结果：${card.last_result?.display || '尚未跑过'}`,
              ),
              card.needsDay
                ? h('input', {
                    'data-dc-input': '',
                    type: 'date',
                    value: dayDraft[card.id] || '',
                    onChange: (e) =>
                      setDayDraft((s) => ({ ...s, [card.id]: e.target.value })),
                  })
                : null,
              h(
                'button',
                {
                  'data-dc-btn': '',
                  'data-primary': '',
                  disabled: busy || status?.sched_busy?.busy || status?.lock?.busy,
                  onClick: () => start(card.id),
                },
                '手动启动',
              ),
            ),
          ),
        ),
        h(
          Card,
          { title: '跑表', loading: busy },
          h(
            'div',
            { 'data-dc-row': '' },
            (runs?.filters || status?.tasks || []).map((t) =>
              h(
                'button',
                {
                  key: t.id,
                  'data-dc-tab': '',
                  'data-on': task === t.id ? '' : undefined,
                  disabled: busy,
                  onClick: () => load(t.id, 1),
                },
                t.title,
              ),
            ),
            h('input', {
              'data-dc-input': '',
              type: 'date',
              value: from,
              onChange: (e) => setFrom(e.target.value),
            }),
            h('input', {
              'data-dc-input': '',
              type: 'date',
              value: to,
              onChange: (e) => setTo(e.target.value),
            }),
            h(
              'button',
              { 'data-dc-btn': '', disabled: busy, onClick: () => load(task, 1) },
              '查询',
            ),
          ),
          h(
            'table',
            { 'data-dc-table': '' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                ['编号', '任务类型', '开始', '结束', '状态', '自然日', '说明'].map((t) =>
                  h('th', { key: t }, t),
                ),
              ),
            ),
            h(
              'tbody',
              null,
              (runs?.rows || []).map((r) =>
                h(
                  'tr',
                  { key: r.id },
                  h('td', null, String(r.id)),
                  h('td', null, r.task_title),
                  h('td', null, r.started_at_display),
                  h('td', null, r.finished_at_display),
                  h('td', null, r.status_zh),
                  h('td', null, r.day_key || '—'),
                  h('td', null, r.summary || '—'),
                ),
              ),
            ),
          ),
          h(Pager, {
            page: runs?.page || 1,
            pages: runs?.pages || 1,
            disabled: busy,
            onChange: (p) => load(task, p),
          }),
        ),
      );
    }

    function Panel() {
      const [tab, setTab] = useState('memory');
      useEffect(() => {
        ensureCss();
      }, []);
      return h(
        'div',
        { 'data-dc-page': '' },
        h(
          'div',
          { 'data-dc-tabs': '' },
          [
            ['memory', '记忆查询'],
            ['config', '参数配置'],
            ['sched', '定时任务'],
          ].map(([id, label]) =>
            h(
              'button',
              {
                key: id,
                'data-dc-tab': '',
                'data-on': tab === id ? '' : undefined,
                onClick: () => setTab(id),
              },
              label,
            ),
          ),
        ),
        tab === 'memory' ? h(MemoryPage) : null,
        tab === 'config' ? h(ConfigPage) : null,
        tab === 'sched' ? h(SchedPage) : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots');
        if (!slots?.inject || !slots?.register) {
          console.warn('[dsh-companion] slots 不可用，设置页未挂上');
          return;
        }
        slots.inject('settings.section', () =>
          slots.register(
            {
              name: 'settings.section',
              id: 'dsh-companion',
              order: 40,
              label: '角色世界',
            },
            () => h(Panel),
          ),
        );
      },
    };
  },
});
