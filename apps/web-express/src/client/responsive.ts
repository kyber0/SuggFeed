(() => {
  const navigation = document.querySelector<HTMLDetailsElement>('.staff-navigation-disclosure');
  if (!navigation) return;
  const desktop = matchMedia('(min-width:801px)');
  navigation.open = desktop.matches;
  desktop.addEventListener('change', event => {navigation.open = event.matches;});
})();
