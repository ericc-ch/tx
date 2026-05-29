#!/usr/bin/env fish

# RAM benchmark: shared user-data-dir + profile-directory vs separate user-data-dirs.
# No tx extension. Helium built-ins disabled for a lean baseline.
# Usage: fish scripts/test-profiles.fish [count]
# Default count: 10

if test -z "$HELIUM"
    set -g HELIUM (command -v helium 2>/dev/null)
end
if test -z "$HELIUM" -a -n "$HELIUM_PATH"
    set -g HELIUM $HELIUM_PATH
end
if test -z "$HELIUM"
    echo "error: helium not found (install helium or set HELIUM_PATH)" >&2
    exit 1
end

set -g INSTANCE_COUNT 10
if test (count $argv) -ge 1
    set INSTANCE_COUNT $argv[1]
end

set -g RUN_ID (random)
set -g SHARED /tmp/tx-profile-bench-$RUN_ID
set -g SEP_PREFIX /tmp/tx-separate-$RUN_ID

set -g COMMON_FLAGS \
    --headless=new \
    --no-first-run \
    --no-default-browser-check \
    --disable-default-apps \
    --disable-gpu \
    --disable-dev-shm-usage \
    --mute-audio \
    --disable-extensions \
    --disable-component-extensions-with-background-pages \
    --disable-component-update \
    --disable-sync \
    --disable-background-networking

set -g SETTLE_SEC 1
set -g SPAWN_GAP_SEC 0.3

function cleanup
    pkill -9 -f "user-data-dir=$SHARED" 2>/dev/null
    pkill -9 -f "user-data-dir=$SEP_PREFIX-" 2>/dev/null
    rm -rf $SHARED $SEP_PREFIX-*
end

function drop_singleton_lock --argument-names dir
    rm -f $dir/SingletonLock $dir/SingletonCookie $dir/SingletonSocket 2>/dev/null
end

function wait_for_procs --argument-names pgrep_pattern min_count timeout_sec
    set -l elapsed 0
    while test $elapsed -lt $timeout_sec
        set -l n (count (pgrep -f "$pgrep_pattern"))
        if test $n -ge $min_count
            return 0
        end
        sleep 0.5
        set elapsed (math $elapsed + 1)
    end
    return 1
end

function measure_rss_kb --argument-names pgrep_pattern
    set -l pids (pgrep -f "$pgrep_pattern")
    set -l proc_count (count $pids)
    set -l total_rss_kb 0
    set -l main_count 0

    for pid in $pids
        set -l line (ps -o rss=,cmd= -p $pid 2>/dev/null)
        if test -z "$line"
            continue
        end
        set -l rss (echo $line | awk '{print $1}')
        set -l cmd (echo $line | cut -d' ' -f2-)
        set total_rss_kb (math $total_rss_kb + $rss)
        if not string match -q '*--type=*' -- $cmd
            set main_count (math $main_count + 1)
        end
    end

    echo "$proc_count $main_count $total_rss_kb"
end

function spawn_shared_profile --argument-names profile
    $HELIUM $COMMON_FLAGS \
        --user-data-dir=$SHARED \
        --profile-directory=$profile \
        about:blank &
end

function spawn_separate --argument-names dir
    $HELIUM $COMMON_FLAGS \
        --user-data-dir=$dir \
        about:blank &
end

function kill_pattern --argument-names pgrep_pattern
    pkill -9 -f "$pgrep_pattern" 2>/dev/null
    sleep 0.5
end

function parse_measure --argument-names line
    set -l procs (echo $line | awk '{print $1}')
    set -l main (echo $line | awk '{print $2}')
    set -l rss_kb (echo $line | awk '{print $3}')
    set -l rss_mb (math -s2 "$rss_kb / 1024")
    set -l per_inst (math -s2 "$rss_mb / $INSTANCE_COUNT")
    echo "$procs $main $rss_kb $rss_mb $per_inst"
end

trap cleanup EXIT

echo "=============================================="
echo " tx RAM benchmark: profile-dir vs user-data-dir"
echo "=============================================="
echo "helium:    $HELIUM"
$HELIUM --version 2>&1 | head -1
echo "run id:    $RUN_ID"
echo "instances: $INSTANCE_COUNT"
echo "note:      no extensions loaded"
echo ""

# --- Phase 1: shared user-data-dir, N profiles ---
echo "Phase 1: shared user-data-dir + $INSTANCE_COUNT profile-directories"
drop_singleton_lock $SHARED
mkdir -p $SHARED

for i in (seq 1 $INSTANCE_COUNT)
    if test $i -eq 1
        echo "  spawning profile-1 (new browser)..."
    else
        echo "  spawning profile-$i (attach)..."
    end
    spawn_shared_profile "profile-$i"
    if test $i -eq 1
        if not wait_for_procs "user-data-dir=$SHARED" 3 15
            echo "  warn: profile-1 slow to start" >&2
        end
    end
    sleep $SPAWN_GAP_SEC
end
sleep $SETTLE_SEC

set -l shared_parsed (parse_measure (measure_rss_kb "user-data-dir=$SHARED"))
set -l shared_procs (echo $shared_parsed | awk '{print $1}')
set -l shared_main (echo $shared_parsed | awk '{print $2}')
set -l shared_rss_kb (echo $shared_parsed | awk '{print $3}')
set -l shared_rss (echo $shared_parsed | awk '{print $4}')
set -l shared_per (echo $shared_parsed | awk '{print $5}')

kill_pattern "user-data-dir=$SHARED"
drop_singleton_lock $SHARED

# --- Phase 2: N separate user-data-dirs ---
echo "Phase 2: $INSTANCE_COUNT separate user-data-dirs"
for i in (seq 1 $INSTANCE_COUNT)
    set -l dir "$SEP_PREFIX-$i"
    echo "  spawning $dir..."
    spawn_separate $dir
    if test $i -eq 1
        if not wait_for_procs "user-data-dir=$SEP_PREFIX-" 3 15
            echo "  warn: separate-1 slow to start" >&2
        end
    end
    sleep $SPAWN_GAP_SEC
end
sleep $SETTLE_SEC

set -l sep_parsed (parse_measure (measure_rss_kb "user-data-dir=$SEP_PREFIX-"))
set -l sep_procs (echo $sep_parsed | awk '{print $1}')
set -l sep_main (echo $sep_parsed | awk '{print $2}')
set -l sep_rss_kb (echo $sep_parsed | awk '{print $3}')
set -l sep_rss (echo $sep_parsed | awk '{print $4}')
set -l sep_per (echo $sep_parsed | awk '{print $5}')

kill_pattern "user-data-dir=$SEP_PREFIX-"

# --- Report ---
set -l rss_saved_kb (math $sep_rss_kb - $shared_rss_kb)
set -l rss_saved (math -s2 "$rss_saved_kb / 1024")
set -l proc_saved (math $sep_procs - $shared_procs)

echo ""
echo "=============================================="
echo " REPORT ($INSTANCE_COUNT instances, headless about:blank)"
echo "=============================================="
printf "%-28s %12s %12s\n" "Metric" "Shared+Profile" "Separate dir"
printf "%-28s %12s %12s\n" "────────────────────────────" "────────────" "────────────"
printf "%-28s %12s %12s\n" "Helium processes" $shared_procs $sep_procs
printf "%-28s %12s %12s\n" "Browser processes" $shared_main $sep_main
printf "%-28s %9s MB %9s MB\n" "Total RSS (summed)" $shared_rss $sep_rss
printf "%-28s %9s MB %9s MB\n" "RSS per instance" $shared_per $sep_per
echo ""

if test $rss_saved_kb -gt 0
    set -l rss_pct (math -s1 "100 * $rss_saved_kb / $sep_rss_kb")
    echo "Shared+profile saves ~$rss_saved MB total (~$rss_pct%) vs separate dirs."
else if test $rss_saved_kb -lt 0
    set -l rss_extra (math -s2 "0 - $rss_saved")
    echo "Shared+profile used ~$rss_extra MB MORE total."
else
    echo "Total RSS equal in this run."
end

if test $proc_saved -gt 0
    echo "Process count reduced by $proc_saved."
end

echo ""
echo "32 GB capacity hint (~22 GB for browsers, linear from per-instance RSS):"
if test $shared_rss_kb -gt 0
    set -l cap_shared (math -s0 "22000 / $shared_per")
    echo "  ~$cap_shared instances @ shared+profile"
end
if test $sep_rss_kb -gt 0
    set -l cap_sep (math -s0 "22000 / $sep_per")
    echo "  ~$cap_sep instances @ separate user-data-dir"
end
echo ""
echo "Method: sum RSS (ps) of all PIDs matching user-data-dir. Relative compare OK; absolute may overcount shared pages."
