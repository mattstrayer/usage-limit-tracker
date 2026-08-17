#!/usr/bin/env bash
# Claude Code status line: model | git | ctx | 5h | 7d | cost | +/- lines
# 5h/7d bars use a risk-aware color model (inspired by TokenEater), Balanced profile.
input=$(cat)
[ -f ~/.claude/statusline/.debug ] && printf "%s\n" "$input" > ~/.claude/statusline/last-input.json
# Optional: extra status line command(s) passed as args; run with same input, printed first.
for extra in "$@"; do o=$(printf "%s" "$input" | bash -c "$extra"); [ -n "$o" ] && printf "%s\n" "$o"; done
j() { printf '%s' "$input" | jq -r "$1"; }

DIM=$'\e[2m'; BOLD=$'\e[1m'; RST=$'\e[0m'
ORANGE=$'\e[38;2;217;119;87m'   # Anthropic, for the git glyph
NOW=$(date +%s)

# smart <used%> <resets_at|""> <window_secs|0>  -> "r;g;b zone elapsed_pct"
# window 0 => threshold-only (used for context bar). Colors: muted green/amber/red.
smart() {
  awk -v u="$1" -v at="$2" -v win="$3" -v now="$NOW" 'BEGIN{
    u=u/100
    # ---- risk ----
    if (win>0 && at!="" ) {
      e=1-(at-now)/win; if(e<0)e=0; if(e>1)e=1
      k=5; projUpper=1.4; aLo=0.50; aHi=1.00; m=0.10
      conf=1-exp(-k*e)
      proj=(e>0)?u/e:(u>0?99:0)
      ph=ss(0.7,1.0,proj)
      absR=ss(aLo,aHi,u)*ph
      projR=ss(1.0,projUpper,proj)*conf
      paceR=ss(m,m+0.15,u-e)*conf
      r=absR; if(projR>r)r=projR; if(paceR>r)r=paceR
      zone=(r<0.30)?"chill":(r<0.55)?"ontrack":(r<0.78)?"warning":"hot"
      ep=int(e*100+0.5)
    } else {
      # threshold gauge: 60 warn / 85 critical, mapped onto the same ramp
      r=(u>=0.85)?1:(u>=0.60)?0.55+0.30*(u-0.60)/0.25:0.30*u/0.60
      zone="-"; ep=-1
    }
    # ---- color ramp (HSB) stops: 0/.30 normal, .55 warning, .85/1 critical ----
    # muted: normal #7FB88A, warning #D9A35B, critical #CF6B6B (desaturated green/amber/red)
    if (r<=0.30){c=hsb(127,184,138)}
    else if (r<0.55){t=(r-0.30)/0.25; c=lerp(127,184,138, 217,163,91, t)}
    else if (r<0.85){t=(r-0.55)/0.30; c=lerp(217,163,91, 207,107,107, t)}
    else {c=hsb(207,107,107)}
    printf "%s %s %d\n", c, zone, ep
  }
  function ss(a,b,x,  t){ if(x<=a)return 0; if(x>=b)return 1; t=(x-a)/(b-a); return t*t*(3-2*t) }
  function hsb(R,G,B){ return R";"G";"B }
  function max3(a,b,c){ return a>b?(a>c?a:c):(b>c?b:c) }
  function min3(a,b,c){ return a<b?(a<c?a:c):(b<c?b:c) }
  function lerp(r1,g1,b1,r2,g2,b2,t,  h1,s1,v1,h2,s2,v2,d,h,s,v){
    tohsv(r1,g1,b1); h1=H;s1=S;v1=V; tohsv(r2,g2,b2); h2=H;s2=S;v2=V
    d=h2-h1; if(d>180)d-=360; if(d<-180)d+=360
    h=h1+d*t; if(h<0)h+=360; if(h>=360)h-=360
    s=s1+(s2-s1)*t; v=v1+(v2-v1)*t
    return torgb(h,s,v)
  }
  function tohsv(r,g,b,  mx,mn,dl){
    r/=255;g/=255;b/=255; mx=max3(r,g,b); mn=min3(r,g,b); dl=mx-mn; V=mx; S=(mx==0)?0:dl/mx
    if(dl==0)H=0; else if(mx==r)H=60*(((g-b)/dl)%6); else if(mx==g)H=60*((b-r)/dl+2); else H=60*((r-g)/dl+4)
    if(H<0)H+=360
  }
  function torgb(h,s,v,  c,x,mm,r,g,b,hh){
    c=v*s; hh=h/60; x=c*(1-abs((hh%2)-1)); mm=v-c
    if(hh<1){r=c;g=x;b=0}else if(hh<2){r=x;g=c;b=0}else if(hh<3){r=0;g=c;b=x}
    else if(hh<4){r=0;g=x;b=c}else if(hh<5){r=x;g=0;b=c}else{r=c;g=0;b=x}
    return int((r+mm)*255+0.5)";"int((g+mm)*255+0.5)";"int((b+mm)*255+0.5)
  }
  function abs(x){ return x<0?-x:x }'
}

# bar <used%> <width> <resets_at> <window_secs> -> colored bar + pct + zone glyph
bar() {
  local pct=${1%.*} w=$2 at=$3 win=$4 rgb zone ep filled i ch out=""
  [ -z "$pct" ] || [ "$pct" = "null" ] && pct=0
  read -r rgb zone ep <<<"$(smart "$pct" "$at" "$win")"
  filled=$(( pct * w / 100 )); [ "$filled" -gt "$w" ] && filled=$w
  local tick=-1; [ "$ep" -ge 0 ] && tick=$(( ep * w / 100 )); [ "$tick" -ge "$w" ] && tick=$((w-1))
  local col=$'\e[38;2;'"${rgb}m" cur=""
  for ((i=0;i<w;i++)); do
    if [ "$i" -eq "$tick" ]; then ch="│"; elif [ "$i" -lt "$filled" ]; then ch="█"; else ch="░"; fi
    if [ "$i" -lt "$filled" ]; then [ "$cur" != f ] && { out+="$col"; cur=f; }; else [ "$cur" != e ] && { out+="$DIM"; cur=e; }; fi
    out+="$ch"
  done
  local glyph=""
  case "$zone" in chill) glyph=" ●";; ontrack) glyph=" ●";; warning) glyph=" ▲";; hot) glyph=" ▲";; esac
  printf '%s%s %s%3d%%%s%s' "$out" "$RST" $'\e[38;2;'"${rgb}m" "$pct" "$glyph" "$RST"
}

reset_in() { # reset_in <epoch>
  local at=$1 diff
  [ -z "$at" ] || [ "$at" = "null" ] && return
  diff=$(( at - NOW )); [ "$diff" -lt 0 ] && diff=0
  if [ "$diff" -ge 86400 ]; then printf ' %dd%dh' $((diff/86400)) $((diff%86400/3600))
  else printf ' %dh%02dm' $((diff/3600)) $((diff%3600/60)); fi
}

model=$(j '.model.display_name // "?"')
cwd=$(j '.workspace.current_dir // .cwd // empty')
ctx=$(j '.context_window.used_percentage // 0')
five=$(j '.rate_limits.five_hour.used_percentage // empty')
five_at=$(j '.rate_limits.five_hour.resets_at // empty')
week=$(j '.rate_limits.seven_day.used_percentage // empty')
week_at=$(j '.rate_limits.seven_day.resets_at // empty')
cost=$(j '.cost.total_cost_usd // empty')
added=$(j '.cost.total_lines_added // 0')
removed=$(j '.cost.total_lines_removed // 0')

git_seg=""
if [ -n "$cwd" ] && branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null); then
  dirty=""; [ -n "$(git -C "$cwd" status --porcelain 2>/dev/null | head -1)" ] && dirty="*"
  git_seg="  ${ORANGE} ${RST}${branch}${dirty}"
fi

out="${BOLD}${model}${RST}${git_seg}  ctx $(bar "$ctx" 10 "" 0)"
[ -n "$five" ] && out+="  5h $(bar "$five" 10 "$five_at" 18000)$(reset_in "$five_at")"
[ -n "$week" ] && out+="  7d $(bar "$week" 10 "$week_at" 604800)$(reset_in "$week_at")"
[ -n "$cost" ] && out+="  ${DIM}\$$(printf '%.2f' "$cost")${RST}"
[ "$added" != "0" ] || [ "$removed" != "0" ] && out+="  ${DIM}+${added}/-${removed}${RST}"
printf '%s\n' "$out"
