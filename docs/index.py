import pandas as pd 
import panel as pn
pn.extension('tabulator', sizing_mode="stretch_width")
import hvplot.pandas
import datetime as dt
    

df = pd.read_csv('https://raw.githubusercontent.com/ArchedEnemy/test1/main/docs/understat.csv', parse_dates = ['date'], dayfirst=True)

date_range_slider = pn.widgets.DateRangeSlider(
    name='Date Range Slider',
    start=min(df['date']), end=max(df['date']),
    value=(dt.datetime(2022, 8, 5), max(df['date'])),
    step=24*3600*1*1000
)
teams = pn.widgets.MultiSelect(options=list(df['team'].unique()),name='Team',value=list(df['team'].unique()),size=10)
sort = pn.widgets.Select(options=['shot', 'onTarget', 'goal', 'xG', 'xG_Diff','%ShotsOnTarget','GoalsPerShot', 'attAssists', 'Assits', 'xA', 'xA_Diff'],name='Sort by', value='goal')

	
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

pn.Column(pn.Row(teams, pn.Column(date_range_slider, sort)), hvplot.bind(input_function1, date_range_slider, teams, sort)).servable()