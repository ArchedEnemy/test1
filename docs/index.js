importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.4/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/panel-0.14.4-py3-none-any.whl', 'pyodide-http==0.1.0', 'datetime', 'holoviews>=1.15.4', 'hvplot', 'pandas']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

import pandas as pd 
import panel as pn
import hvplot.pandas
import datetime as dt

df = pd.read_csv("https://github.com/ArchedEnemy/test1/raw/main/understat_adj.csv",parse_dates = ['date'])

pn.extension('tabulator', sizing_mode="stretch_width")

date_range_slider = pn.widgets.DateRangeSlider(
    name='Date Range Slider',
    start=min(df['date']), end=max(df['date']),
    value=(dt.datetime(2022, 8, 5), max(df['date'])),
    step=24*3600*1*1000
).servable()
teams = pn.widgets.MultiSelect(options=list(df['team'].unique()),name='Team',value=list(df['team'].unique()),size=10).servable()
sort = pn.widgets.Select(options=['shot', 'onTarget', 'goal', 'xG', 'xG_Diff','%ShotsOnTarget','GoalsPerShot', 'attAssists', 'Assits', 'xA', 'xA_Diff'],name='Sort by', value='goal').servable()


def input_function1(sdate, team, sortby):
    a=sdate[0]
    b=sdate[1]
    df3 = df[(df.date >= a) & (df.date <= b)]
    df3 = df3[df3['team'].isin(teams.value)]
    df3['%ShotsOnTarget'] = df3['onTarget']/df3['shot']
    df3['GoalsPerShot'] = df3['goal']/df3['shot']
    df4 = df3.groupby(['player','team']).aggregate({'shot':'sum','onTarget':'sum','%ShotsOnTarget':'mean','goal':'sum','xG':'sum','GoalsPerShot':'mean'})
    df4['xG_Diff'] = df4['goal']-df4['xG']
    assist_df = df3.groupby(['player_assist']).aggregate({'shot':'sum','goal':'sum','xG':'sum'})
    assist_df = assist_df.reset_index()
    assist_df = assist_df.rename(columns={'player_assist': 'player','shot': 'attAssists','goal': 'Assists','xG': 'xA'})
    assist_df['xA_Diff'] = assist_df['Assists']-assist_df['xA']
    assist_df['xA'] = assist_df['xA'].fillna(0) 
    assist_df['Assists'] = assist_df['Assists'].fillna(0) 
    assist_df['attAssists'] = assist_df['attAssists'].fillna(0) 
    assist_df['xA_Diff'] = assist_df['xA_Diff'].fillna(0) 
    df5 = pd.merge(df4, assist_df,how='left', on='player').sort_values(by=sortby, ascending=False).head(20)
    return df5

inputi = hvplot.bind(input_function1, date_range_slider, teams, sort)
pn.Column(pn.Row(teams, pn.Column(date_range_slider, sort)), inputi).servable()

await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()