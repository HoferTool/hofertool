# Seit 1.528.0 schlägt 508 Werkzeuge kein Fach mehr vor: in den Tests legt
# man darum jedes CAM-Werkzeug von Hand in das Fach mit seiner Nummer
# (so wie früher die Vorgabe), soweit es dieses Fach gibt.
def alle_auf_nr(pg):
    for s in pg.locator("select.wz5-fach").all():
        nr = s.get_attribute("data-wz5-fach")
        if s.locator(f"option[value='{nr}']").count():
            s.select_option(nr)
    pg.wait_for_timeout(50)
