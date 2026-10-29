# =================================================================
#  EINRICHTBLÄTTER — Excel-Dateien aus den Typ-Ordnern in die App
#
#  Läuft alle fünf Minuten in der Aufgabe "HoferTool" (hofertool.ps1),
#  ohne Knopf in der App (Wunsch Patrick 8. Oktober 2026). Unveränderte
#  Dateien erkennt es an Name, Grösse und Änderungszeit und lässt sie in
#  Ruhe. Welche Ordner es anschaut und zu welchem Maschinentyp
#  jeder gehört, steht in der App unter Einstellungen → Dokumente →
#  Einrichtblatt-Ordner.
#
#  In den Ordnern liegen auch PDFs, CAD-Dateien und anderes. Das
#  Programm nimmt nur Excel-Dateien (.xlsx, .xlsm, .xls) mit einer
#  HOCO Nr. im Namen, wie auch immer sie sonst heissen:
#
#     10844-0049.xlsx                    → Einrichtblatt der HOCO Nr.
#     Werkzeugprotokoll 10844-0049.xlsx    10844-0049 auf dem Typ des
#     10844-0049 Index C100.xlsm           Ordners
#
#  Steht im Namen "Protokoll" (Werkzeugprotokoll, WZ-Protokoll …), ist
#  es ein Einrichtblatt, egal was sonst noch im Namen steht und in welcher
#  Reihenfolge (Wunsch Patrick 16. Oktober 2026). Ohne "Protokoll" zählt
#  die Datei nur, wenn ausser HOCO Nr. und Typ nichts im Namen steht.
#  Ebenso mit "Einrichtblatt" im Namen (Patrick 29. Oktober 2026).
#  Werkzeugwechsel und Toleranzen sind nie ein Einrichtblatt; war so eins
#  schon hochgeladen, nimmt das Programm es in der App wieder weg. Gibt es
#  für eine HOCO Nr. mehrere, zählt das Werkzeugprotokoll, sonst die
#  zuletzt geänderte Datei. Lässt sich die Datei nicht lesen (leer,
#  kaputt, kein Excel), ist die nächste dran; geht keine, bleibt die
#  Nummer ohne neues Blatt. Eine Datei wird nur hochgeladen, wenn sie neu
#  ist oder sich seit dem letzten Mal geändert hat.
#
#  Regel wie bei den Zeichnungen (Wunsch Patrick, 9. Oktober 2026: "WBGs
#  und Einrichtblätter kann jeder löschen; wenn man löscht, soll es eine
#  andere Datei versuchen; falls keine vorhanden, steht dort nicht
#  vorhanden; manuell hochgeladen ist Master"):
#   - Nimmt jemand das Einrichtblatt in der App weg ("Einrichtblatt
#     entfernen" im Betrachter oder bei der HOCO Nr.), kommt beim
#     nächsten Durchlauf die nächste Excel-Datei dieser Nummer im Ordner.
#     Die weggenommene steht in einrichtblaetter-stand.json unter
#     "abgelehnt" (mit Grösse und Änderungszeit) und kommt nicht wieder,
#     solange sie nicht geändert wird. Wird sie im Ordner neu gespeichert,
#     zählt sie wieder (Patrick 15. Oktober 2026: bei der Index lag das
#     geänderte Werkzeugprotokoll so fest). Gibt es keine andere mehr,
#     bleibt die Nummer ohne Blatt.
#   - Ein Blatt, das nicht von diesem Programm stammt (in der App von Hand
#     hinterlegt), ist Master und wird nie ersetzt. Woran man das erkennt:
#     Die Adresse in hoco_type_data.blatt_url ist nicht die, die das
#     Programm selbst hochgeladen hat ("adressen"). Blätter aus einer
#     Fassung vor dieser Regel zählen als eigene (einmalig aus "dateien"
#     übernommen), damit geänderte Excel-Dateien weiter hochkommen.
#
#  DAS PROGRAMM LIEST NUR. In den Ordnern wird nie etwas gelöscht,
#  verschoben, umbenannt oder geändert. Zum Hochladen kopiert es die
#  Datei zuerst nach %TEMP% und lädt die Kopie hoch, so stört es auch
#  nicht, wenn die Datei gerade in Excel offen ist.
#
#  Höchstens 150 Dateien je Durchlauf; sind es mehr, macht der nächste
#  Durchlauf weiter.
#
#  Aufruf:
#     .\einrichtblaetter.ps1            normaler Durchlauf
#     .\einrichtblaetter.ps1 -Probe     sofort ein Probelauf, nie hochladen
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "einrichtblaetter-stand.json"
$protDatei  = Join-Path $ordnerHier "einrichtblaetter.log"
$hoechstensJeLauf = 150
$listeHoechstens  = 600

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  if ($Probe) { Write-Host $zeile }
  try {
    Add-Content -Path $protDatei -Value $zeile -Encoding UTF8
    $alle = Get-Content -Path $protDatei -Encoding UTF8
    if ($alle.Count -gt 3000) { $alle | Select-Object -Last 2000 | Set-Content -Path $protDatei -Encoding UTF8 }
  } catch { }
}

# ---------- Einstellungen ----------
if (-not (Test-Path $einstDatei)) { Schreibe "abgleich-einstellungen.json fehlt"; exit 1 }
$E = Get-Content -Raw -Path $einstDatei -Encoding UTF8 | ConvertFrom-Json
$U = ($E.supabase_url).TrimEnd("/")
$KEY = $E.anon_key

# Anmeldung und welche Datei je HOCO Nr. und Typ zuletzt hochgeladen wurde
# (dateien: Kennung, adressen: die eigene Adresse in der App, abgelehnt:
# in der App weggenommene Dateien, volle Pfade)
$stand = @{ token = $null; ablauf = 0; auffrischen = $null; dateien = @{}; adressen = @{}; abgelehnt = @{}; erledigt = $null; letzter = $null; einrichtFrei = $false }
$adressenNeu = $true
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
    $stand.erledigt = $g.erledigt; $stand.letzter = $g.letzter; $stand.einrichtFrei = [bool]$g.einrichtFrei
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
    if ($g.PSObject.Properties.Name -contains "adressen") { $adressenNeu = $false }
    if ($g.adressen) { $g.adressen.PSObject.Properties | ForEach-Object { $stand.adressen[$_.Name] = [string]$_.Value } }
    if ($g.abgelehnt) { $g.abgelehnt.PSObject.Properties | ForEach-Object { $stand.abgelehnt[$_.Name] = @($_.Value | ForEach-Object { [string]$_ }) } }
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
}
# Einmalig: Blätter mit "Einrichtblatt" im Namen hat das Programm selbst
# am 15. Oktober 2026 als fremd aus der App genommen, danach galten sie als
# "in der App entfernt" und kamen nie wieder (10000-0291, 10007-0804 auf
# der SB-20RG, Patrick 29. Oktober 2026). Diese Einträge fallen weg.
if (-not $stand.einrichtFrei) {
  foreach ($k in @($stand.abgelehnt.Keys)) {
    $stand.abgelehnt[$k] = @($stand.abgelehnt[$k] | Where-Object { $_ -and (Split-Path -Leaf ($_.Split("|")[0])) -notmatch '(?i)einricht' })
    if ($stand.abgelehnt[$k].Count -eq 0) { $stand.abgelehnt.Remove($k) }
  }
  $stand.einrichtFrei = $true
  if (Test-Path $standDatei) { StandSichern }
}

. (Join-Path $ordnerHier "dokumente-teile.ps1")

# Ist die Excel-Datei ein Einrichtblatt? Im selben Ordner liegen auch
# Toleranzen, Plattenwechsel, Werkzeugkosten usw. mit derselben HOCO Nr.
#   1 = HOCO Nr. und "Protokoll" im Namen (Werkzeugprotokoll, auch
#       vertippt, WZ-Protokoll, Protokoll allein). Was sonst noch im Namen
#       steht und in welcher Reihenfolge, spielt keine Rolle (Wunsch
#       Patrick 16. Oktober 2026: bei der Index heissen sie mal
#       "10841-0017 Werkzeugprotokoll Index C100", mal anders, und
#       manche kamen nicht hoch).
#   2 = HOCO Nr. und ein anderes Protokoll (Teileprotokoll, Messprotokoll)
#   3 = nur HOCO Nr. (dazu höchstens Typ, Maschine wie C100, "SW", "Nr");
#       so heissen die Blätter der meisten anderen Maschinen
#   0 = kein Einrichtblatt, bleibt weg: Werkzeugwechsel(protokoll) und
#       Toleranzen, auch zusammen mit "Protokoll" (Wunsch Patrick
#       15. Oktober 2026), und ohne Protokoll jedes andere Wort im Namen
function Rang([string]$name, [string]$typName) {
  $ohne = [regex]::Replace([IO.Path]::GetFileNameWithoutExtension($name), '\d{4,6}\s?-\s?\d{3,5}', ' ')
  # Maschinenbezeichnungen wie "C100" gehören zum Typ, nicht als fremdes
  # Wort ("10007-0026 Index C100.xlsx")
  $ohne = [regex]::Replace($ohne, '(?i)(?<![a-zäöü])[a-z]{1,3}\d+', ' ')
  $woerter = @(($ohne.ToLower() -split '[^a-zäöüß]+') | Where-Object { $_ })
  # Wechsel (auch "Werkzeugwechelsprotokoll") und Toleranzen nie
  $nie = @($woerter | Where-Object { $_ -match 'wech|toleranz' })
  if ($nie.Count -gt 0) { return @{ rang = 0; fremd = ($nie -join " ") } }
  $prot = 0
  foreach ($w in $woerter) {
    if ($w -match 'prot[o]?k') {
      if ($w -match '^(werkz[a-z]*|wz)?prot') { $prot = 1 } elseif ($prot -eq 0) { $prot = 2 }
    }
  }
  # "Einrichtblatt" im Namen (auch "Einrichteblatt", "Einrichtungsblatt")
  # ist so gut wie das Werkzeugprotokoll; so heissen die Blätter der
  # SB-20RG ("10000-0355 Einrichtblatt.xlsx"), die vorher als fremdes Wort
  # wegblieben (Patrick 29. Oktober 2026)
  if (@($woerter | Where-Object { $_ -match '^einricht' }).Count -gt 0) { $prot = 1 }
  if ($prot -gt 0) { return @{ rang = $prot; fremd = "" } }
  $typWoerter = @(($typName.ToLower() -split '[^a-zäöüß]+') | Where-Object { $_ })
  $fremd = @()
  foreach ($w in $woerter) {
    # "Werkzeug", "WZ", "Aut.308" (Automat) und einzelne Buchstaben (SB-16E) sind kein
    # fremdes Wort
    if ($typWoerter -contains $w -or $w.Length -eq 1 -or @('sw', 'nr', 'werkzeug', 'wz', 'aut', 'automat') -contains $w) { continue }
    $fremd += $w
  }
  if ($fremd.Count -gt 0) { return @{ rang = 0; fremd = ($fremd -join " ") } }
  return @{ rang = 3; fremd = "" }
}

# Lässt sich die Datei als Excel lesen? Leere oder kaputte Dateien und
# solche, die nur .xlsx heissen, haben vorne nicht die Kennung von Excel
# (xlsx/xlsm sind ZIP: "PK", xls: D0 CF 11 E0). Dann kommt die nächste
# Datei derselben HOCO Nr. dran (Wunsch Patrick 16. Oktober 2026).
function Lesbar($d) {
  if ($d.Length -lt 8) { return $false }
  try {
    $f = [IO.File]::Open($d.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
      $b = New-Object byte[] 4
      if ($f.Read($b, 0, 4) -lt 4) { return $false }
    } finally { $f.Close() }
  } catch { return $false }
  if ($b[0] -eq 0x50 -and $b[1] -eq 0x4B) { return $true }
  if ($b[0] -eq 0xD0 -and $b[1] -eq 0xCF -and $b[2] -eq 0x11 -and $b[3] -eq 0xE0) { return $true }
  return $false
}

# In der App weggenommen? Eingetragen ist die Kennung (Pfad, Zeit,
# Grösse), also zählt die Datei wieder, sobald sie geändert wird. Ältere
# Einträge haben nur den Pfad: Die gelten für die Datei, solange sie
# nicht nach dem Wechsel auf diese Regel gespeichert wurde.
$abgelehntRegelAb = [datetime]::Parse("2026-10-15T15:00:00Z").ToUniversalTime()
function IstAbgelehnt($d, $liste) {
  foreach ($e in $liste) {
    if (-not $e) { continue }
    if ($e.Contains("|")) { if ($e -eq (Kennung $d)) { return $true } }
    elseif ($e -eq $d.FullName -and $d.LastWriteTimeUtc -lt $abgelehntRegelAb) { return $true }
  }
  return $false
}

# Wurde so ein Blatt (Toleranzen usw.) früher schon hochgeladen, als die
# Regel noch fehlte, kommt es in der App wieder weg. Nur in der App, die
# Datei im Ordner bleibt unberührt.
function FalschesEntfernen($d, [string]$h, $typ) {
  $alte = @(Lesen ("dokumente?select=id,datei_url&art=eq.einrichtblatt&hoco_nr=eq." + (W $h) +
                   "&type_id=eq." + $typ.id + "&dateiname=eq." + (W $d.Name)))
  if ($alte.Count -eq 0) { return $false }
  $urls = @($alte | ForEach-Object { [string]$_.datei_url })
  Aendern "Delete" ("dokumente?id=in.(" + (($alte | ForEach-Object { $_.id }) -join ",") + ")") $null $null
  $t = @(Lesen ("hoco_type_data?select=blatt_url&hoco_nr=eq." + (W $h) + "&type_id=eq." + $typ.id))
  if ($t.Count -gt 0 -and $urls -contains [string]$t[0].blatt_url) {
    Aendern "Patch" ("hoco_type_data?hoco_nr=eq." + (W $h) + "&type_id=eq." + $typ.id) @{ blatt_url = $null } $null
  }
  AblageLoeschen $urls
  try {
    Aendern "Post" "dokumente_verlauf" @{ dateiname = $d.Name; art = "einrichtblatt"; hoco_nr = $h; type_id = $typ.id;
      ziel = "entfernt: kein Einrichtblatt"; quelle = "eb-ordner"; ersetzt = $true } $null
  } catch { }
  return $true
}


# ---------- Durchlauf ----------
# immer = true sagt der App, dass diese Fassung ohne Knopf läuft
$jetztIso = (Get-Date).ToUniversalTime().ToString("o")
$status = @{ immer = $true; zeit = $jetztIso; gesehen = $jetztIso; rechner = $env:COMPUTERNAME;
             scharf = $false; ordner = @(); excel = 0; neu = 0; ersetzt = 0; gleich = 0; rest = 0;
             ohneNr = 0; fremd = 0; aelter = 0; unlesbar = 0; hochgeladen = 0; manuell = 0; abgelehnt = 0; keineMehr = 0;
             fehler = $null; liste = @() }
function Eintrag($o, [string]$datei, [string]$hoco, [string]$was) {
  if ($status.liste.Count -lt $listeHoechstens) {
    $status.liste += @{ o = $o; d = $datei; h = $hoco; w = $was }
  }
}

try {
  Anmelden

  $werte = @{}
  Lesen "app_config?select=schluessel,wert&schluessel=in.(eb_ordner)" |
    ForEach-Object { if ($_.wert) { try { $werte[$_.schluessel] = $_.wert | ConvertFrom-Json } catch { } } }
  $konf = $werte["eb_ordner"]
  if (-not $konf -or -not $konf.ordner -or @($konf.ordner).Count -eq 0) {
    throw "In der App sind noch keine Einrichtblatt-Ordner eingetragen (Einstellungen → Dokumente)."
  }
  $scharf = -not $Probe
  $status.scharf = $scharf
  if (-not $scharf) { Schreibe "Probelauf: es wird nichts hochgeladen." }

  $typen = @(Lesen "machine_types?select=id,name")
  # Welche HOCO Nr. auf welchem Typ hat in der App schon ein Einrichtblatt, und welches?
  $vorhanden = @{}; $blattVon = @{}
  Lesen "hoco_type_data?select=hoco_nr,type_id,blatt_url&blatt_url=not.is.null" |
    ForEach-Object { $k = [string]$_.hoco_nr + "|" + [string]$_.type_id; $vorhanden[$k] = $true; $blattVon[$k] = [string]$_.blatt_url }
  # Blätter, die in der App gemacht und als gut bestätigt sind: dafür
  # nie mehr ein Excel (Wunsch Patrick, 13. Oktober 2026). Fehlt die
  # Tabelle einrichtblatt_app noch, gibt es eben keine.
  $inDerApp = @{}
  try {
    Lesen "einrichtblatt_app?select=hoco_nr,type_id&gut_am=not.is.null" |
      ForEach-Object { $inDerApp[[string]$_.hoco_nr + "|" + [string]$_.type_id] = $true }
  } catch { }
  # Einmalig nach dem Wechsel auf diese Fassung: Was das Programm früher
  # hochgeladen hat (dateien), gilt als eigenes Blatt, nicht als Master
  if ($adressenNeu) {
    foreach ($k in @($stand.dateien.Keys)) { if ($blattVon[$k]) { $stand.adressen[$k] = [string]$blattVon[$k] } }
    $adressenNeu = $false
    StandSichern
  }

  $nochFrei = $hoechstensJeLauf
  $oi = -1
  foreach ($o in @($konf.ordner)) {
    $oi++
    $pfad = PfadAufloesen ([string]$o.pfad)
    $typ = $typen | Where-Object { [string]$_.id -eq [string]$o.typ } | Select-Object -First 1
    $info = @{ pfad = $pfad; typ = $(if ($typ) { $typ.name } else { "" }); excel = 0; fehler = $null }
    $status.ordner += $info
    if (-not $pfad) { continue }
    if (-not $typ) { $info.fehler = "Kein Maschinentyp gewählt"; Schreibe ("Ordner ohne Typ: " + $pfad); continue }
    if (-not (Test-Path -LiteralPath $pfad)) {
      $info.fehler = "Ordner nicht erreichbar"
      if ($pfad -match '^[D-Zd-z]:') {
        $info.fehler += ". Das Laufwerk " + $pfad.Substring(0, 2) + " kennt die Aufgabe nicht, besser \\Server\Freigabe\... eintragen"
      }
      Schreibe ("Ordner nicht erreichbar: " + $pfad)
      continue
    }

    # *.xls* trifft .xls, .xlsx und .xlsm. "~$…" sind Sperrdateien von Excel.
    $alle = @(Get-ChildItem -LiteralPath $pfad -File -Filter "*.xls*" -Recurse:([bool]$o.unter) -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -match '^\.(xlsx|xlsm|xls)$' -and $_.Name -notlike '~$*' })
    $info.excel = $alle.Count
    $status.excel += $alle.Count

    # Je HOCO Nr. das Werkzeugprotokoll, sonst ein anderes Protokoll,
    # sonst die Datei nur mit Nummer; bei mehreren die zuletzt geänderte
    $jeNr = @{}
    # Weggelassene Dateien kommen nur in die Liste, wenn ihre Nummer gar
    # kein Blatt bekommt; sonst füllen die vielen Toleranzen die Liste und
    # man sieht nicht, warum eine Nummer leer bleibt (Patrick 29. Oktober 2026)
    $weggelassen = @()
    foreach ($d in $alle) {
      $h = HocoAusName $d.Name
      if (-not $h) { $status.ohneNr++; Eintrag $oi $d.Name "" "ohne HOCO Nr. im Namen, bleibt weg"; continue }
      $r = Rang $d.Name $typ.name
      if ($r.rang -eq 0) {
        $status.fremd++
        $was = "kein Einrichtblatt (" + $r.fremd + "), bleibt weg"
        if ($scharf) {
          try {
            if (FalschesEntfernen $d $h $typ) {
              # Das Programm hat es selbst weggenommen, nicht jemand in
              # der App: darum nicht als abgelehnt merken
              $sk = $h + "|" + [string]$typ.id
              if ($stand.dateien[$sk] -and ([string]$stand.dateien[$sk]).Split("|")[0] -eq $d.FullName) {
                $stand.dateien.Remove($sk); $stand.adressen.Remove($sk); StandSichern
              }
              $was = "kein Einrichtblatt (" + $r.fremd + "), aus der App entfernt"
              Schreibe ("aus der App entfernt: " + $d.FullName)
            }
          } catch { Schreibe ("Entfernen ging nicht: " + $d.Name + ": " + $_.Exception.Message) }
        }
        $weggelassen += @{ d = $d.Name; h = $h; w = $was }
        continue
      }
      $d | Add-Member -NotePropertyName HoferRang -NotePropertyValue $r.rang -Force
      if (-not $jeNr[$h]) { $jeNr[$h] = @() }
      $jeNr[$h] += $d
    }
    foreach ($e in $weggelassen) { if (-not $jeNr[$e.h]) { Eintrag $oi $e.d $e.h $e.w } }
    foreach ($h in ($jeNr.Keys | Sort-Object)) {
      $schluessel = $h + "|" + [string]$typ.id
      $jetzt = [string]$blattVon[$schluessel]
      $eigene = [string]$stand.adressen[$schluessel]

      # Blatt in der App ist gut: kein Excel mehr, auch kein nächstes
      if ($inDerApp[$schluessel]) { Eintrag $oi "" $h "Blatt in der App, kein Excel mehr"; continue }

      # In der App von Hand hinterlegt: Master, bleibt
      if ($jetzt -and ($jetzt -ne $eigene)) { $status.manuell++; Eintrag $oi "" $h "in der App von Hand hinterlegt (Master), bleibt"; continue }

      # Das eigene Blatt ist in der App weggenommen worden: diese Datei
      # kommt nie wieder, die nächste ist dran
      if (-not $jetzt -and $stand.dateien[$schluessel]) {
        $weg = [string]$stand.dateien[$schluessel]
        if ($weg) {
          if (-not $stand.abgelehnt[$schluessel]) { $stand.abgelehnt[$schluessel] = @() }
          if ($stand.abgelehnt[$schluessel] -notcontains $weg) { $stand.abgelehnt[$schluessel] += $weg }
        }
        $stand.dateien.Remove($schluessel); $stand.adressen.Remove($schluessel)
        StandSichern
        $status.abgelehnt++
        Schreibe ("Einrichtblatt von " + $h + " auf " + $typ.name + " in der App entfernt, nächste Datei: " + $weg.Split("|")[0])
      }

      $gruppe = @($jeNr[$h] | Where-Object { -not (IstAbgelehnt $_ @($stand.abgelehnt[$schluessel])) } |
        Sort-Object @{ Expression = { $_.HoferRang } }, @{ Expression = { $_.LastWriteTimeUtc }; Descending = $true })
      if ($gruppe.Count -eq 0) { $status.keineMehr++; Eintrag $oi "" $h "alle Dateien in der App entfernt, bleibt ohne Blatt"; continue }
      # Die beste Datei ist schon in der App und unverändert: nichts zu
      # tun, auch nichts zu öffnen
      if ($jetzt -and $stand.dateien[$schluessel] -eq (Kennung $gruppe[0])) {
        $status.gleich++
        foreach ($x in ($gruppe | Select-Object -Skip 1)) { $status.aelter++; Eintrag $oi $x.Name $h ("weiteres Blatt, es zählt " + $gruppe[0].Name) }
        continue
      }

      # Sonst die erste Datei, die sich lesen lässt; lässt sich eine
      # nicht lesen, ist die nächste dran. Geht keine, bleibt die Nummer
      # wie sie ist, die App zeigt dann "Kein Einrichtblatt vorhanden".
      $d = $null; $kopie = $null
      foreach ($x in $gruppe) {
        if ($d) { $status.aelter++; Eintrag $oi $x.Name $h ("weiteres Blatt, es zählt " + $d.Name); continue }
        if (-not (Lesbar $x)) { $status.unlesbar++; Eintrag $oi $x.Name $h "lässt sich nicht lesen, nächste Datei"; continue }
        # Im Probelauf und wenn die Datei schon drin ist, nicht kopieren
        if ($scharf -and $nochFrei -gt 0 -and -not ($jetzt -and $stand.dateien[$schluessel] -eq (Kennung $x))) {
          try { $kopie = LesendKopieren $x } catch {
            $status.unlesbar++; Eintrag $oi $x.Name $h ("lässt sich nicht lesen (" + $_.Exception.Message + "), nächste Datei"); continue
          }
        }
        $d = $x
      }
      if (-not $d) { $status.keineMehr++; Eintrag $oi "" $h "keine Datei lesbar, bleibt wie es ist"; continue }
      $kennung = Kennung $d
      if ($jetzt -and $stand.dateien[$schluessel] -eq $kennung) { $status.gleich++; continue }

      $ersetzt = [bool]$vorhanden[$schluessel]
      if ($ersetzt) { $status.ersetzt++ } else { $status.neu++ }
      $was = $(if ($ersetzt) { "ersetzt das Einrichtblatt in der App" } else { "neu" })
      if (-not $scharf) { Eintrag $oi $d.Name $h ("würde hochladen: " + $was); Schreibe ("Probe: " + $d.FullName + "  →  " + $h + " auf " + $typ.name + ", " + $was); continue }
      if ($nochFrei -le 0) { $status.rest++; Eintrag $oi $d.Name $h "kommt beim nächsten Durchlauf"; continue }

      try {
        $z = @{ hoco = $h; typ = $typ; art = "einrichtblatt"; titel = $h; fa = $null; auftrag = $null; grund = ""; passt = $true }
        $script:letzteAdresse = $null
        Hochladen $kopie $z "eb-ordner"
        $stand.dateien[$schluessel] = $kennung
        $stand.adressen[$schluessel] = [string]$script:letzteAdresse
        StandSichern
        $blattVon[$schluessel] = [string]$script:letzteAdresse
        $vorhanden[$schluessel] = $true
        $status.hochgeladen++
        $nochFrei--
        Eintrag $oi $d.Name $h ("hochgeladen, " + $was)
        Schreibe ($d.FullName + "  →  " + $h + " auf " + $typ.name)
      } catch {
        Eintrag $oi $d.Name $h ("Fehler: " + $_.Exception.Message)
        Schreibe ("Fehler bei " + $d.FullName + ": " + $_.Exception.Message)
        $status.fehler = "Fehler bei " + $d.Name + ": " + $_.Exception.Message
      } finally {
        # Nur die eigene Kopie in %TEMP% wegräumen, nie das Original
        if ($kopie) { Remove-Item -LiteralPath (Split-Path -Parent $kopie.FullName) -Recurse -Force -ErrorAction SilentlyContinue }
      }
    }
  }
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

# Wann zuletzt etwas hochkam, bleibt stehen, auch wenn die nächsten
# Durchläufe nichts Neues finden
if ($status.hochgeladen -gt 0) { $status.zuletzt = @{ zeit = $jetztIso; anzahl = $status.hochgeladen } }
elseif ($stand.letzter) { try { $l = $stand.letzter | ConvertFrom-Json; if ($l.zuletzt) { $status.zuletzt = $l.zuletzt } } catch { } }
try {
  Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "eb_ordner_status";
    wert = ($status | ConvertTo-Json -Compress -Depth 4) } "resolution=merge-duplicates"
} catch { Schreibe ("Stand nicht an die App gemeldet (sql/einrichtblatt-ordner.sql ausgeführt?): " + $_.Exception.Message) }
$stand.letzter = ($status | ConvertTo-Json -Compress -Depth 4)
StandSichern

if ($Probe -or -not $status.scharf) {
  Write-Host ""
  Write-Host ("Probelauf: " + $status.excel + " Excel-Dateien gefunden, " + ($status.neu + $status.ersetzt) +
    " würden hochgeladen (" + $status.neu + " neu, " + $status.ersetzt + " ersetzen ein vorhandenes), " +
    $status.ohneNr + " ohne HOCO Nr., " + $status.fremd + " keine Einrichtblätter (Toleranzen usw.), " + $status.aelter + " weitere Blätter derselben Nummer, " +
    $status.manuell + " von Hand hinterlegt (Master), " + $status.keineMehr + " ohne Blatt, weil alle entfernt. Nichts hochgeladen, im Ordner nichts verändert.")
  foreach ($o in $status.ordner) {
    $t = "  " + $o.pfad + "  (Typ " + $o.typ + "): " + $o.excel + " Excel-Dateien"
    if ($o.fehler) { $t += " — " + $o.fehler }
    Write-Host $t
  }
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
