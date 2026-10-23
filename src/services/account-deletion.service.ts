import { AuthenticationError, ValidationError } from "../helpers/errors.helper";
import * as DeletionRepo from "../repositories/account-deletion.repository";
import { findAccountsForRevocation } from "../repositories/external-account.repository";
import { processTransaction } from "../utils/query";
import { revokeExternalAccounts } from "./account-revocation.service";

export async function deleteOwnAccount(userId: string, confirmation: string): Promise<void> {
  await processTransaction(async client => {
    const account = await DeletionRepo.lockAccount(client, userId);
    if (!account) throw new AuthenticationError("Sesion invalida o usuario no disponible");

    const emails = [account.email, ...account.contact_emails];
    if (confirmation !== "ELIMINAR" && !emails.some(email => email.toLowerCase() === confirmation.toLowerCase())) {
      throw new ValidationError("La confirmacion no coincide con uno de tus correos ni con ELIMINAR");
    }

    const accounts = await findAccountsForRevocation(client, userId);
    await DeletionRepo.invalidateAccountSessions(client, userId);
    await revokeExternalAccounts(accounts);
    await DeletionRepo.deletePersonalData(client, userId);
  });
}
