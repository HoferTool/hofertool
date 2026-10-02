# Bestellungen per Mail aus der App — zwei Wege

Beide Wege bringen dasselbe: Beim Bestellen drückst du einen Knopf, die
Mail mit dem PDF geht an den Lieferanten. Der Unterschied liegt darin,
**von wem** die Mail kommt und **was du dafür einrichten musst**.

---

## Variante 1 — festes Postfach

**So sieht es aus:** Die Mail kommt von `bestellung@hoferco.ch`.
Der Lieferant sieht diese Adresse als Absender. Du selbst stehst in
Kopie, damit du die Mail auch hast.

**Was du machen musst — einmalig, etwa 15 Minuten:**

1. **Postfach anlegen.** Im Microsoft 365 Admin Center unter
   *Benutzer → Aktive Benutzer → Benutzer hinzufügen* einen Benutzer
   `bestellung` anlegen. Passwort notieren.
   *Alternativ:* T&N bitten, das zu machen — für die ist das Routine.

2. **Versand freischalten.** Im Exchange Admin Center beim Postfach
   `bestellung` unter *Postfach → E-Mail-Apps* den Haken bei
   **Authentifiziertes SMTP** setzen. Ohne diesen Haken verweigert
   Microsoft den Versand aus fremden Programmen.

3. **Mir schicken:** die Adresse `bestellung@hoferco.ch` und das
   Passwort. Ich lege beides geschützt bei Supabase ab — es steht nie
   in der App und ist für niemanden sichtbar, der die App öffnet.

4. **Fertig.** Ich baue den Rest: PDF erzeugen, Mail zusammensetzen,
   versenden, dich in Kopie setzen.

**Kosten:** Ein Microsoft-Benutzer kostet eine Lizenz. Für ein reines
Versandpostfach gibt es die Möglichkeit eines **freigegebenen
Postfachs**, das kostenlos ist — dann muss aber ein bestehender
Benutzer den Versand darüber machen, was die Einrichtung etwas
verkompliziert. T&N kann dir sagen, was bei euch einfacher ist.

**Nachteile:**
- Antworten des Lieferanten landen in `bestellung@`, nicht bei dir.
  Du müsstest dieses Postfach in Outlook mit einbinden.
- In deinem eigenen Outlook erscheint die Bestellung nicht unter
  „Gesendet", nur als Kopie im Posteingang.

---

## Variante 2 — Anmeldung mit dem eigenen Microsoft-Konto

**So sieht es aus:** Beim ersten Bestellen fragt die App einmal nach
deiner Microsoft-Anmeldung, dasselbe Fenster wie bei Outlook im
Browser. Danach gehen alle Bestellungen **von dir** raus, mit deinem
Namen, und liegen in deinem Outlook unter „Gesendet". Antworten kommen
direkt zu dir. Jeder Kollege, der bestellt, meldet sich einmal selbst an.

**Was du machen musst — einmalig, eher Sache von T&N:**

1. **App-Registrierung anlegen.** Im Microsoft Entra Admin Center
   (früher Azure AD) unter *App-Registrierungen → Neue Registrierung*.
   Name: `Hofer Tool`. Als Weiterleitungsadresse die Adresse der App
   eintragen, also `https://syshen69.github.io/hofer/`.

2. **Berechtigung geben.** Bei dieser Registrierung unter
   *API-Berechtigungen* die Berechtigung **Mail.Send** hinzufügen und
   die **Administratorzustimmung** erteilen. Das ist der Klick, der
   sagt: „Diese App darf im Namen des angemeldeten Benutzers Mails
   senden."

3. **Mir schicken:** die **Anwendungs-ID** und die **Verzeichnis-ID**,
   die auf der Übersichtsseite der Registrierung stehen. Beides sind
   keine Geheimnisse, sie dürfen in der App stehen.

4. **Fertig.** Ich baue den Anmeldeknopf und den Versand.

**Kosten:** keine. Ihr habt Microsoft 365 schon, mehr braucht es nicht.

**Nachteile:**
- Die Einrichtung in Entra ist nichts, was man mal eben nebenbei
  macht. Ich würde die Schritte für T&N aufschreiben, damit sie das
  in einer Viertelstunde erledigen.
- Wer bestellt, muss ein eigenes Microsoft-Konto haben. Für Personen
  ohne Login in der App geht das nicht.

---

## Der Vergleich auf einen Blick

|                     | Variante 1 · Postfach       | Variante 2 · Microsoft-Konto     |
|---------------------|-----------------------------|----------------------------------|
| Absender            | bestellung@hoferco.ch       | du selbst                        |
| Antworten kommen    | ins Postfach bestellung@    | direkt zu dir                    |
| In deinem Gesendet  | nein, nur Kopie             | ja                               |
| Einrichtung         | 15 Min, Admin Center        | 15 Min, Entra — eher T&N         |
| Wer kann bestellen  | jeder mit App-Login         | nur wer ein Microsoft-Konto hat  |
| Kosten              | evtl. eine Lizenz           | keine                            |

---

## Was in beiden Fällen gleich ist

- Die App erzeugt das PDF selbst, mit Logo und Tabelle wie heute.
  Der Drucken-Dialog entfällt.
- Ein Knopf **Bestellen per Mail** löst alles aus. Vorher zeigt die
  App dir Empfänger, Betreff und die Positionen zur Kontrolle.
- Die Bestellung wird wie bisher als „bestellt" gebucht, mit
  Zeitstempel und deinem Namen.
- Geht der Versand schief, siehst du eine Meldung — nichts wird still
  verschluckt.

## Meine Empfehlung

**Variante 1 zum Start.** Sie ist schneller da, und ob euch die Mails
im eigenen Gesendet-Ordner fehlen, merkt ihr im Betrieb. Variante 2
lässt sich später drauflegen, ohne dass etwas verloren geht.
