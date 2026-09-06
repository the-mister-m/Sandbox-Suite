def test_import_server():
    import server

def test_ade_page():
    import server
    client = server.app.test_client()
    assert client.get("/ade").status_code == 200
