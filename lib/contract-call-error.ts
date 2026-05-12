import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
} from "viem";

const INVALID_UNLOCK_SELECTOR = "0x3bdb79ba";

/** Текст помилки для UI після simulate / writeContract. */
export function formatContractCallError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? "");
  if (/user rejected|denied transaction|rejected the request/i.test(raw)) {
    return "Підпис скасовано в гаманці. Спробуйте ще раз, якщо хочете продовжити мінт.";
  }
  if (raw.includes(INVALID_UNLOCK_SELECTOR)) {
    return "Час відкриття має бути пізнішим за час блоку мережі (InvalidUnlockDate). Оберіть дату хоча б на 1 годину пізніше за «зараз» або пресет 7 днів+ і підтвердіть у гаманці без довгої паузи.";
  }
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof InsufficientFundsError)) {
      return "Недостатньо RITUAL на балансі для оплати газу.";
    }
    const revert = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (revert instanceof ContractFunctionRevertedError) {
      if (revert.reason) return revert.reason;
      const name = revert.data?.errorName;
      if (name) {
        if (name === "InvalidUnlockDate") {
          return "Час відкриття має бути пізніше за час блоку мережі (InvalidUnlockDate). Спробуйте пресет 7d+ або пізнішу дату.";
        }
        return name;
      }
    }
    return error.shortMessage || error.message;
  }
  if (error instanceof Error) return error.message;
  return "Транзакція не вдалася. Перевірте мережу Ritual Testnet (1979) і адресу контракту.";
}
