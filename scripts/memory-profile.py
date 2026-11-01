#!/usr/bin/env python3
"""Measure Linux PSS for the app and all its descendants, including WebKit.
Run the release binary first. Does not send Bluetooth commands or change settings.
"""
import argparse,json,time,sys
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--pid',type=int,required=True)
p.add_argument('--seconds',type=int,default=30)
p.add_argument('--max-pss-mib',type=float)
p.add_argument('--max-growth-mib',type=float)
p.add_argument('--output',default='test-results/memory.json')
a=p.parse_args()
if not 2<=a.seconds<=3600:p.error('--seconds deve estar entre 2 e 3600')
root=Path('/proc')
if not (root/str(a.pid)).exists():p.error('PID não encontrado; abra o executável de produção primeiro')
def sample():
    parents={}
    for d in root.iterdir():
        if not d.name.isdigit():continue
        try:
            # comm may contain spaces and parentheses. Fields after its final ) start at state.
            fields=(d/'stat').read_text().rsplit(')',1)[1].split()
            parents[int(d.name)]=int(fields[1])
        except (OSError,ValueError,IndexError):continue
    if a.pid not in parents:raise RuntimeError('Aplicativo encerrou durante a medição')
    descendants={a.pid}
    while True:
        expanded=descendants|{pid for pid,parent in parents.items() if parent in descendants}
        if expanded==descendants:break
        descendants=expanded
    total=0;measured=[];missing=[]
    for pid in sorted(descendants):
        try:
            lines=(root/str(pid)/'smaps_rollup').read_text().splitlines()
            pss=int(next(line for line in lines if line.startswith('Pss:')).split()[1]);total+=pss;measured.append(pid)
        except (OSError,StopIteration,ValueError):missing.append(pid)
    if missing:raise RuntimeError(f'PSS indisponível para processos {missing}; medição incompleta')
    return {'elapsed_s':round(time.monotonic()-start,2),'pss_mib':round(total/1024,2),'pids':measured}
start=time.monotonic();samples=[]
try:
    for i in range(a.seconds+1):
        samples.append(sample())
        if i<a.seconds:time.sleep(1)
except RuntimeError as e:sys.exit(str(e))
peak=max(s['pss_mib'] for s in samples);growth=round(samples[-1]['pss_mib']-samples[0]['pss_mib'],2)
report={'platform':sys.platform,'metric':'PSS (app + descendants)','duration_s':a.seconds,'peak_mib':peak,'growth_mib':growth,'limits':{'peak_mib':a.max_pss_mib,'growth_mib':a.max_growth_mib},'samples':samples}
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n')
print(f'Pico PSS: {peak:.2f} MiB; variação: {growth:+.2f} MiB. Relatório: {out}')
if a.max_pss_mib is not None and peak>a.max_pss_mib:sys.exit('Limite de memória excedido')
if a.max_growth_mib is not None and growth>a.max_growth_mib:sys.exit('Limite de crescimento excedido')
