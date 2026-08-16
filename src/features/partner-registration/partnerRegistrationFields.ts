const cyrillicPlateLetters: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X'
};

export const normalizeVehiclePlate = (value: string) => value.toUpperCase().replace(
  /[АВЕКМНОРСТУХ]/g,
  (letter) => cyrillicPlateLetters[letter] ?? letter
);
