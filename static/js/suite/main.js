// suite entry — switches between the Suite Page and the Library

(function () {
  function showView(id) {
    document.getElementById("view-suite").hidden = id !== "suite";
    document.getElementById("view-library").hidden = id !== "library";
    document.getElementById("nav-suite-btn").classList.toggle("active", id === "suite");
    document.getElementById("nav-library-btn").classList.toggle("active", id === "library");
  }

  document.getElementById("nav-suite-btn").onclick = () => showView("suite");
  document.getElementById("nav-library-btn").onclick = () => showView("library");

  Suite.init();
  Library.init();
  showView("suite");
})();
