import { CandyMachine, Metaplex, toBigNumber } from "@metaplex-foundation/js";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { MintCounterBorsh } from "../borsh/mintCounter";
import {
  GuardGroup,
  GuardGroupStates,
  MintLimitLogics,
  ParsedPricesForUI,
  Token,
  TokenPayment$Gate,
} from "./types";
import {
  DefaultCandyGuardSettings,
  Metadata,
  SplTokenCurrency,
} from "@metaplex-foundation/js";

export const guardToPaymentUtil = (guards: GuardGroup): ParsedPricesForUI => {
  const paymentsRequired: ParsedPricesForUI = {
    payment: [],
    gate: [],
    burn: [],
  };
  if (!guards) return paymentsRequired;
  // console.log("guardToPaymentUtil", { guards });
  const actions: ("payment" | "burn" | "gate")[] = ["payment", "burn", "gate"];
  if (actions.find((action) => guards[action])) {
    if (guards.payment?.sol) {
      paymentsRequired.payment.push({
        label: "SOL",
        price: guards.payment.sol.amount / LAMPORTS_PER_SOL,
        kind: "sol",
      });
    }

    for (let action of actions) {
      if (guards[action]?.token) {
        paymentsRequired[action].push({
          label: guards[action].token.symbol || "token",
          price:
            guards[action].token.amount / 10 ** guards[action].token.decimals,
          decimals: guards[action].token.decimals,
          mint: guards[action].token.mint,
          kind: "token",
        });
      }
      if (guards[action]?.nfts?.length) {
        paymentsRequired[action].push({
          label: guards[action].nfts[0].symbol || "NFT",
          mint: guards[action].requiredCollection,
          price: 1,
          kind: "nft",
        });
      }
    }
  }
  return paymentsRequired;
};

export const mintLimitCaches: { [k: string]: Promise<MintLimitLogics> } = {};

export const fetchMintLimit = (
  mx: Metaplex,
  candyMachine: CandyMachine,
  guardsInput$mintLimit,
  rerenderer?: () => void
): Promise<MintLimitLogics> => {
  const cacheKey = `${
    guardsInput$mintLimit.id
  }-${candyMachine.candyGuard.address.toString()}-${mx
    .identity()
    .publicKey.toString()}`;
  if (!mintLimitCaches[cacheKey]) {
    mintLimitCaches[cacheKey] = (async () => {
      const mintLimit: MintLimitLogics = {
        settings: guardsInput$mintLimit,
      };
      if (!mintLimit.pda)
        mintLimit.pda = await mx.candyMachines().pdas().mintLimitCounter({
          candyGuard: candyMachine.candyGuard.address,
          id: guardsInput$mintLimit.id,
          candyMachine: candyMachine.address,
          user: mx.identity().publicKey,
        });
      if (mintLimit.pda) {
        mintLimit.accountInfo = await mx.connection.getAccountInfo(
          mintLimit.pda
        );
        if (mintLimit.accountInfo)
          mintLimit.mintCounter = MintCounterBorsh.fromBuffer(
            mintLimit.accountInfo.data
          );
      }
      if (rerenderer) setTimeout(() => rerenderer(), 100);

      return mintLimit;
    })();
  }
  return mintLimitCaches[cacheKey];
};

export const mergeGuards = (guardsArray: DefaultCandyGuardSettings[]) => {
  const guards: DefaultCandyGuardSettings = guardsArray.reduce(
    (acc, guards) => {
      acc = { ...acc };
      Object.entries(guards).forEach(([key, guard]) => {
        if (guard) acc[key] = guard;
      });
      return acc;
    } //,
    //{} as DefaultCandyGuardSettings
  );
  //   console.log({ guards });
  return guards;
};

export const parseGuardGroup = async (
  {
    candyMachine,
    guards: guardsInput,
    label,
    walletAddress,
    nftHoldings,
    tokenHoldings,
  }: {
    guards: DefaultCandyGuardSettings;
    candyMachine: CandyMachine;
    walletAddress: PublicKey;
    label: string;
    tokenHoldings: Token[];
    nftHoldings: Metadata[];
  },
  mx?: Metaplex
): Promise<GuardGroup> => {
  const guardsParsed: GuardGroup = {};

  // Check for payment guards
  if (guardsInput.solPayment) {
    guardsParsed.payment = {
      sol: {
        amount: guardsInput.solPayment.amount.basisPoints.div( toBigNumber(10**9)).toNumber() * 10 ** 9,
        decimals: guardsInput.solPayment.amount.currency.decimals,
      },
    };
  }

  if (guardsInput.tokenPayment) {
    guardsParsed.payment = {
      token: {
        mint: guardsInput.tokenPayment.mint,
        symbol: guardsInput.tokenPayment.amount.currency.symbol,
        amount: guardsInput.tokenPayment.amount.basisPoints.toNumber(),
        decimals: guardsInput.tokenPayment.amount.currency.decimals,
      },
    };
    await updateTokenSymbolAndDecimalsFromChainAsync(
      mx,
      guardsParsed.payment.token
    );
  }

  if (guardsInput.nftPayment) {
    guardsParsed.payment = {
      nfts: nftHoldings.filter((y) =>
        y.collection?.address.equals(guardsInput.nftPayment.requiredCollection)
      ),
      requiredCollection: guardsInput.nftPayment.requiredCollection,
    };
  }

  // Check for burn guards
  if (guardsInput.tokenBurn) {
    guardsParsed.burn = {
      token: {
        mint: guardsInput.tokenBurn.mint,
        symbol: guardsInput.tokenBurn.amount.currency.symbol,
        amount: guardsInput.tokenBurn.amount.basisPoints.toNumber(),
        decimals: guardsInput.tokenBurn.amount.currency.decimals,
      },
    };
    await updateTokenSymbolAndDecimalsFromChainAsync(
      mx,
      guardsParsed.burn.token
    );
  }

  if (guardsInput.nftBurn) {
    guardsParsed.burn = {
      nfts: nftHoldings.filter((y) =>
        y.collection?.address.equals(guardsInput.nftBurn.requiredCollection)
      ),
      requiredCollection: guardsInput.nftBurn.requiredCollection,
    };
  }

  // Check for gates
  if (guardsInput.tokenGate) {
    guardsParsed.gate = {
      token: {
        mint: guardsInput.tokenGate.mint,
        symbol: guardsInput.tokenGate.amount.currency.symbol,
        amount: guardsInput.tokenGate.amount.basisPoints.toNumber(),
        decimals: guardsInput.tokenGate.amount.currency.decimals,
      },
    };
    await updateTokenSymbolAndDecimalsFromChainAsync(
      mx,
      guardsParsed.gate.token
    );
  }

  if (guardsInput.nftGate) {
    guardsParsed.gate = {
      nfts: nftHoldings.filter((y) =>
        y.collection?.address.equals(guardsInput.nftGate.requiredCollection)
      ),
      requiredCollection: guardsInput.nftGate.requiredCollection,
    };
  }

  return guardsParsed;
};

export const parseGuardStates = ({
  guards,
  candyMachine,
  walletAddress,
  tokenHoldings,
  balance,
  nftHoldings
}: {
  guards: GuardGroup;
  candyMachine: CandyMachine;
  walletAddress: PublicKey;
  tokenHoldings: Token[];
  balance: number;
  nftHoldings: Metadata[];
}): GuardGroupStates => {
  const states: GuardGroupStates = {
    isStarted: true,
    isEnded: false,
    isLimitReached: false,
    canPayFor: 10,
    messages: [],
    isWalletWhitelisted: true,
    hasGatekeeper: false,
  };
  // if (guards.payment?.nfts?.length) debugger;
  // Check for start date
  if (guards.startTime) {
    states.isStarted = guards.startTime.getTime() < Date.now();
  }
  // Check for start date
  if (guards.endTime) {
    states.isEnded = guards.endTime.getTime() < Date.now();
  }

  // Check for mint limit
  if (guards.mintLimit) {
    let canPayFor =
      typeof guards.mintLimit?.settings?.limit == "number"
        ? guards.mintLimit.settings.limit -
          (guards.mintLimit?.mintCounter?.count || 0)
        : 10;
    states.isLimitReached = !canPayFor;
    if (!canPayFor)
      states.messages.push("Mint limit for each user has been reached.");
    states.canPayFor = Math.max(states.canPayFor, canPayFor);
  }

  // Check for redeemed list
  if (typeof guards.redeemLimit == "number") {
    let canPayFor = Math.max(
      guards.redeemLimit - candyMachine.itemsMinted.toNumber(),
      0
    );
    states.isLimitReached = !canPayFor;
    if (!canPayFor) states.messages.push("Redeem limit has been reached.");
    states.canPayFor = Math.max(states.canPayFor, canPayFor);
  }

  // Check for payment guards
  if (guards.payment?.sol) {
    let canPayFor = Math.floor(
      balance / (guards.payment?.sol.amount + 0.012 * LAMPORTS_PER_SOL)
    );
    if (!canPayFor) states.messages.push("Not enough SOL to mint.");
    states.canPayFor = Math.max(states.canPayFor, canPayFor);
  }

  if (guards.payment?.token) {
    const tokenAccount = tokenHoldings.find((x) =>
      x.mint.equals(guards.payment?.token.mint)
    );
    let canPayFor = tokenAccount
      ? Math.floor(tokenAccount.balance / guards.payment?.token.amount)
      : 0;

    if (!canPayFor)
      states.messages.push(
        `Insufficient ${"fomo3d" || "token"} balance.`
      );

    states.canPayFor = Math.max(states.canPayFor, canPayFor);
  }

  if (guards.payment?.nfts) {
    let canPayFor = guards.payment?.nfts.length || 0;
    if (!canPayFor) states.messages.push(`Insufficient NFT balance.`);
    states.canPayFor = Math.max(states.canPayFor, canPayFor);
  }

  // Check for burn guards
  if (guards.burn?.token) {
    const tokenAccount = tokenHoldings.find((x) =>
      x.mint.equals(guards.burn?.token.mint)
    );
    let canPayFor = tokenAccount
      ? Math.floor(tokenAccount.balance / guards.burn?.token.amount)
      : 0;

    if (!canPayFor)
      states.messages.push(
        `Not enough ${"fomo3d" || "token"} to burn.`
      );

    states.canPayFor = Math.max(states.canPayFor, canPayFor);
  }

  if (guards.burn?.nfts) {
    const mints = [
      "DEPwYVUD32thChzAz5BXMowDvrqcBAAkvbujgndJgPMt",
      "Btb4b6SMJJP3gSZrZcwoEQASEtjGXSgpKLnWgyt2SKTZ",
      "7a6Dna4qKW3t54YiuPf6WzHAKNgAmiV6qDKf4LFZ73q2",
      "Bq6XTPStVkfWwwCAMZuJrxFcs9wTj7T3CxkSUC8mVwHZ",
      "FScongjEXSUJ4uzbpLipkKtRsxjZj5puYdNxofKH1PPv",
      "Cm8S9Ry3wYm8kv8dkK4pBVrXypCqNWrNh76quBLnMf9S",
      "4RwCk9rXLH4YZp5tzApT5cohQiyXoKpb5XLoPrWbMv7d",
      "C2kwXoDTuRvng9ko1L6PxH3Ci6sYUcYHye2u2EB1s3SB",
      "Ak4BbAqENmDXuc351Ta3nv43ZKk7FcQiCbNXAi2nwbBC",
      "9rGG5fCrHeUScqhFDpctaBvaGL4kwuxa8asR4VuRGF3o",
      "9Hty8LLPxPupHPVRFSaiDDYKPbKJx7GKLg9j4YS1v9TA",
      "Hw1sPrVEe52pDS5fw2gS1q5MVaXE3YUXTNm6rESVCiaU",
      "57yENNNnTYTvuc9Wqp9J7k32DNLr2zZDiSUKFG3HbaU3",
      "cp6jfy9nThcbi8t21P6tJeC4P7E5VFv4RKeBJwvDxTb",
      "CrtURPh7oe55FDAiapL1RMsLTBxfo8FxFZDbpmd5SM2n",
      "AA2bNYugN6ogqr7737v8oJCSYrpXLKfPUi9xXRo4MPe2",
      "AKPQBtkKeXvXcwTb3riT8LJJKV8iTXviVuJpqbpoZ4np",
      "23toJ42XZWLTeMRpPqzXcmWm2oCjg6MiawWq5dzGrkDx",
      "H4kJ6GFvFXq6pe4fBTZGJ33Qoi1gFnSYSSJr5ud81Uyn",
      "7zMC1n4V1dfNam2xnyifs8bV7exWW2852dT7VFM3ncVm",
      "CN2FhYpez71LwWZsQ4sLxGdvAjVT1AG9GHSZ1ooCd4rs",
      "9W4nDvwFkdKAwtCVamH39WeFH9CWLqD73Dy3W218mEq5",
      "13YZcrz5tdghzx7obA3Uz2RkxRNkE2BaG6yrz9buFNZ3",
      "4kgM9xNYumwfEyWiAQC7fM5KFnnFEJrXeKNyjNXUPiSF",
      "3PF6C7m1r6Qz7RdKyKQxjpzULUTkvtWhd1zq6fySD84k",
      "DcRNH6Gmb5AeYirwEssGtAV5QDajmBRULuPQyyA3y6Bb",
      "DKuhTd7h3E733knE72HX9UjQW3MxUZHXvL2Z3vg7PFFR",
      "26jmCp5VEiXqa7T2MpyyfjFaXne5AisM8wHVH2LUdcVF",
      "3WtyyHW6T4zuojqVz3HAdhMPYafF4jw5FipR2riauXiM",
      "BZaQQQAEKJwBgtNZHZoTy8BbymeM3nYV7huq8oBmbz75",
      "Am9QUfdVSWtLTMh5GHuF6W7Nr8W9awQqzdFKPXpbcCUy",
      "J2oB6vhjQeh8UG76w9MsLTBzkzPw6k4GYvvyZTdGBUAH",
      "33DgRCPoGJEFr3MKUfwozJuY1ykgjJQL9HYpkgxzUiM2",
      "xQ6nNuxDxkSv7BzTKDLP5DyVJw8iWrfdsWX4rZnvJmy",
      "TpqiMa93iNi6djVkvRyFyBCf3RuCkmL6PMF1D7XcqCi",
      "H2HVv2AjiE3EtfAsz9cSv25jsNnD5kqR8o7fvTUsEhwp",
      "27YtAY4mWHkVarbCnTUggJhNsocrUEoxuhi91r9QThK8",
      "5Tpu1DHMHQUSS8rZjg43YBifMuESHmE2i8Yq1jgQj8GP",
      "Et5CDFv79qqjCGm97kfJKpuEdutyiHeV1kYdir86pDV5",
      "GxXaXxF4HnPC4aCTVXQ1onf8mGPtLm9jtVBaoZyeLzZo",
      "FUBitgJ6JsnjPm17sWFKGQwfu8ZBZGiUs8vTDD4oSbVq",
      "Fz8pUr2PepSeKvSo5fKEb4qTKw2L2xxqGhuuLZmacPTN",
      "FxF4s5RFVzNy4E4vSunZXbGXT7veBRYgwk85RXiF8Ygt",
      "FHYHtz5xjNm3AE4UPhr7dZEUJ2PgQxantmAkxRMCoQW3",
      "BsFA2f161JhdajqLdAQXsuWkdDpQhaHcx6jYmh17Be99",
      "4bTdpKsATd8m5nDAo5L9tueXYN5Dsx3kUxgDz8y5Jebv",
      "7kqQSDM6v48f3JqBaHi23gS4xqBfnKYEgfdehc4qpcGt",
      "4RYpK7AMJctPSKqhCsCCb6DerK3XMrRrQNgYLQhD5iBw",
      "JDDcGfHmspFSeqye4iSQrqeCgqcN1PQNQjaY4r7gMR7r",
      "C3zik5NmkEHncTAqqvbyyrYVnDKtMhKwmEkaX4w4asNi",
      "35VfGZf5TuUJT6cyrNNnqVHsWb9C4Mdvh4vsDfY4MBjF",
      "22GX6YgHthMVRBwgN6EJue5ZEez7yAri1CF13BGvjtfk",
      "8PY4NBMYjWa2ioLdgCaGRMrsHZVWHcLV2XwmXUyEmJyh",
      "H1np1uww5nx6jhRp8MnKQ62meZrAvME6j5W9k4JcoEX4",
      "Eui3St2AhLZqX4tHu98Nqxsb4Nd4dMeve1qABipmF6ud",
      "79FeARfa2etS7grmvjNsGXNgBotA5SB5pAb2bDhukfeW",
      "Dppj7D322FoVmDT5QmEFSx4A49BvAaRPPmpoJA7LsG9B",
      "HvmVtCpZmK7xHC5y3YuUTRuDjMNWLpvWiuqf5rR5JXrx",
      "232io71aARC7QdFzzpVUoWmv3kYEdhufYFzHBmjiz5G2",
      "9EBbtu4SeYXE4kVUzBgWgQSH3k2HYZya15iXpnLRGbwV",
      "5NsHu1xPi5qfEAbbnUoU3j7BA4DXuKmJVPdLkdCQZLaj",
      "2KSqPNri8UfRiYEkqHfew1BubNaD2iqrMXPkM9qPt62L",
      "AWqfUN3gwi4xgGnpgRdCvXdJPr3YohTQcQ86C1taTux2",
      "AKQ92tYhLMsFEzMQw3Ej96xraxo39o5bUmwEAZh5r3BG",
      "2rcKmFEQd9NwA3NsyfJ1vcuCmgjHFGg8kf1Vm7Zn1YkR",
      "HawzCXJrfgD2GfhE4zoGkeywjBDU5FM2TgsS2hWokf2R",
      "9x2SBZAirAEsJ4RbZPsVd1PvnRtTZHsKjSeJkcs886AF",
      "97sR6YTRBrHnLMFAqPnvfmDms3XrEDXipKnKUb84Sv8v",
      "3KSavH8QEghVaTidFwwUWBxmRj4uzAm3eL6y58evj2MD",
      "5EUtjKmgjWmbs57KtjcwfNr8Ru3dFcL5x7GQFdcLNeMp",
      "E71HR8GBV5a1y1xNTrnDt2xsjdxsKyY1H7WAsJfCPjkL",
      "B3mMbBUd6igie6vegKaChpTxTdebbEbJ4patfSoDtBUm",
      "6jm9MymkCkvbYUTA2Xvwz8AXXEkdWNg4SMBtkXfYwxca",
      "Hhj2NfPvC8zkF1JTh1zNukYKg6eWQuQbAbU5ipGaxH4Q",
      "GzmsCy687tSm8QFKhvJ8auWr82nfxKuaBUNv7R2Yy4iN",
      "Ebtax7cxnxym9tGRXyLdK6FKMQB32dZV3pHewqEBJwvK",
      "CGFupzu5VtU7J7yF7rLHcdugEcfiisB2Qa12187YGFjH",
      "2engFfYHqsCJVrNH33nVScy5NJEAYRMvFL6fhabXQ8uF",
      "Bqt88mKLHbw7B7sCkSEWUoukBhMeZ9A5XcCDWM3MjfGc",
      "jmjk16Thn4umXr4U4ii3vTLe5BYibGTXvNnXVtdwYb5",
      "AFbu5ASgL7q8rhELoJCYiLunTAS5oKPT3wmWa8EHuggQ",
      "MFbmt6avMjxWCu9MyfAtQGH3caVQed1JHEERokwWYsR",
      "GUh8b6ynpG1ikVFHb36iKR6fHdMu33EZoAWMDa58qihL",
      "3STUbvFu8bLzcpc7HmMoozZS8CUe6h1uXCrgk71nxhuY",
      "GHE1ZCoEhwVeujitRrkZ91pLBwxePQSryB4onMJ9KGG1",
      "FKA9mq129ZhWjshwMiVxHx6FZrC9J98VBmwf1MSYnz71",
      "HGTdSMdXDBXJZpb153Uh6t6YWiDaVjRCA1mNSjJUfuf6",
      "FWFPXeJfca2BUp4FZXG6kjmdbZHB9mU1TectFcbuz5WR",
      "Ewe6rQyiAsUB8PCLSX525SVw9z5aMYGL8MstLGtEmWq2",
      "8ELfHqqx2pieVgFLeKZvDGYY4Jhm4VB1pfCWk8YbVtMx",
      "6rJZptXU8acbCBDYBDgaZKE13jJwL9au7P5QEkZUMfQh",
      "673EYxvDgP9HrMMyrGrd7YSrZDECqKGwXCnJNxtkEuiK",
      "3QbWaaae7Xa9q3c8jHETBw6Gr9PExCpoAnGvv6TaNRBL",
      "EK2Z1L5RdpkwGgyhfBTDykNHZwMb6cG4KC2YaEnQGQ86",
      "2EBhmjhG1pjRzFaS2ay1yuLxx8emTcpxMJRxwnvSonXn",
      "5Dkm4JVTBKJS5sFc1p19ASJU3WaZyywYBKFeKpk4oo3r",
      "2P6qz7cx8YAuzZMPJfr4Zm8bsAjauQjm1aZAGcSunRDN",
      "CB4pUE4PwNBKLziqyj7NB1XuM9Z1DcPjRhFvSUwji7sq",
      "C6a662GBZVthpAFkScpLTSQTRGPHkG3CDvmTHv8Zs5C2",
      "7pCpLcKF4pGpw9CgYaYmmurxmaeAAbB8wyikxkWSpmH",
      "89zjGZRL4Uwg8uuEGzbs8JwVNWU8tUAEbKeq2i4zTzrn",
      "7FLwPS9Auki8p77G9Fsh2kfVWxP2umW99C8a45oouKem",
      "HHf3mpcXe4i8QpqZQdA8uLBxxSLLayGh2mKStJBoCLgJ",
      "EJRhee11z6UZfMXuTy3oVxvwt8hjK178xSg8aia4rbHs",
      "BdavXBP39H6R4oyvPxGoe9WrZfGpgsSP2pDbJAX5k3GG",
      "RC4Ep6wN6gz73fSk35iKkEjXXwnNTrP7e8tDwVnLDEs",
      "6Cw35gtgiSZitMDir5z51G29p3aVFZxb7yvDbMeqWvxb",
      "9jkQAnzqnEiZajwR6e3wRNtpfqnzAtt66JBGs8NLjpMy",
      "2gy2aKPb8hQiqEKAQxnT1HPjJ5g6VyYXEGW3uzRAy63A",
      "7wRXpwmqNc2CwtSvRaLcdSkkGmMweQDkHFN5KpTBXHFY",
      "FciWtWb2kiJpVCzJi9RUqqmKn7fpTnZuFkB3n37rgphV",
      "3FuJxZx3Jz3855Ke4vvxESyAjZWYdPUB5uA7tY37Sub7",
      "C8e16JvQnmEJTNMuYhKuY2h3u7mC4q49ezhipNtPPzCY",
      "7zqkkNJGDHS18Uv6C7KQALLHvKJXFZ1aQJd5zvbpBuPk",
      "6KfLRijQfqKrgGVzLpudau9phzMssJQpjUY3d1GyVNLG",
      "5vSZKVBMQKYytjL79JZqDeKrKRVwa9CpXur5eZmd2RDH",
      "G9SBSNs8753qxTJ1gm2DVQecZFyQMRpSS4fHbCHwc2zq",
      "FJj5eLPy2zZG2ePf7GMfeNY7UfAChC4FLBiRoVjCpL1n",
      "C2JVFDgyeHHh8kQbQ7WhuP5TUPStujJjiuvjwfYHy5sD",
      "GXGRj7NU8wMpQad9B69FdEg1xAF5BBEPC6FroUHc5r6v",
      "2X9Fw3DVZaNELXWNSA9iY1YLQDCpW22j87rnCeGj9qE8",
      "AnVWuuxZB1s5Lwmt7kQH5TkkXz8GtqVU1vAexkwtYzWh",
      "56x9cd77g1erJYCcYBcPRR7EfEGAJpvwGJh4XhyrFkNB",
      "EdBnwXZcnrgZgeJoDicUbyxHRYeJxoBDjr4DN5oUhMPe",
      "AVu6s1dYHd1jEcpoU68585JRamXXhYDr9LXtbNYsw4qu",
      "4aKEn6Un7VBn9czQnFuJpmgpyH8WeDjmwFzi4qKCWv6N",
      "Yp6nRsJxPQW6yuLQYG43MQmkRLqRcaVZ4FLkMsbKSDU",
      "B9Benu1B7fdT23cxfxwqbn6N4WFq47qyo2SSQQ5hNb7r",
      "69ZEWZQhyy4sFxQBHn2H9oRG8jRRK1GecMCtGVQ1xoMG",
      "2o9m6tDiM7mTMuCZ6AW1t2CdxZygwQEaFXgi5GSU3PmB",
      "4xJuSe3bmrNYSANLnN9B7Yo4ESPuWqcDmSTAdTpJBYsG",
      "Fj4FEs8jY4rq18TmauDJBZSLVN85EuXaUhtNK85mxzod",
      "E9iEqD9QcJAtWjSy8bQaQgXHVXsUCCEXYEQPKksZyv6Y",
      "7PTKo8w5acNcnvZrC3NZtg7MXjpYmyxXvMfL6UN2XUTL",
      "UfdLMZNiVEMx4cfg7Y6zaU7ZsmzgW4TcnSxyUcw2spq",
      "Ae9KUcyEj2dEdSsRwwyTfoXQcj5UitbStTapzaJeVvEN",
      "2LoLtVv7EncJGiuA37YPDLfpZ9MN4R4E5MVKDsbXB8th",
      "D2K4jvjakALNkUm1KGirSRWiTe6ka8eWpk29imFkxYAg",
      "7U44GMwSz39p32wXZvpbX3y8ZhdiCDLy3zttPXh2Kipk",
      "2ZwbMcCvJihKn4QZs2qQYonEemATupEAXvoWAat2yUJ7",
      "8fiw16ahjachapv56CzYMP6UogVcuf1czAFSPGx29Z6L",
      "37FK1pxzLdoP5rx1aayFNsZkm4ML1CCuaYLoNo6M8jYE",
      "G3YS9cZHyKw8bp45CZPUXwbWK44Xgji21AvTG2FKxpnN",
      "AELJeqZ1hks1TmjdDsvAw5r45Y4c1tHeLunbXzuRfwKG",
      "9t6Te7jUzdDhPuUVb9J6PqG6qZJD8aptTeJG83E3gMzW",
      "8ubw6TAbtB1MxYA4Maqet9vBDQ1PCRFWXVxctGg1mQJr",
      "2s2eiDN3q9nxSJwSTHyqMY1syBKoHAibanr7RcL9Dw9q",
      "2AHhDykSEFt7JJpRPdq5YJ8oK264skb8YiWumt5uPDJn",
      "HWc6DGzNc33pyGBmYxZPRQ3LfBgUfx5ZUJK1dnfe4xeC",
      "6pJrCSB9oP8fFcAEjV2yHqcNFREupNwySgLtUpAUPfbf",
      "CUVd98m6c7EEraziEP8KAmPqH2TCeK9LVhskaEtQPeq6",
      "A1zxDddxaB7acNMaVgnpubC9NGB7Y7isP1h2t5ZHzb3M",
      "6AWGJfQ2cPeLcTSGTZvfbNHGhaHpfbb4W6WfkdLS9LiW",
      "4mKSdBZZ162RLbyFHFEUUbWzmTsXpA3iP858QMfhF3Jg",
      "A2mYUzv34TJnTK9H2C2AFyTVC5cnFa1GyuK14GWfcnMy",
      "D35A2GFyQA8F7NHZSPB1YtguXzzdyBcUMBrq1Vjvkfos",
      "68ssqdyz4wzAuBoUhZ8dvBzUXs3ZSbZkWsLRuKjAnRC3",
      "HFKHj1hZkDBt2Rm6LNV92Cc57As5kEQRxNDoJFPJtZwd",
      "4rjzwLUH4BtBjW3TQqL7CiQyWgdzH2f3EJZM6mqF6395",
      "D4m78ounnXhM2PucmFE42MokRgRUcQ5FbzTwUMyyuLki",
      "8en2RmpUcAYHrZrcJMRQLqhzDhcFuXNmN9w7nBypYkN4",
      "5gbsQhJSQQWBE3i1wzzRz6Uwh6qFNuEtM9huYjVPZAxN",
      "kNhATR9WAa8jPHAQP9d6xJH18hcF9yLWhHhAcTWwgfB",
      "kLdopNLexvgcKxM8zeHuatxkBwTdbwtjZe4FxT1KzL3",
      "7gUJhhHu2vrcG3f2T8ZAD2GAF3dKxeb8EAnyDjsmgHJ6",
      "4mKzYPQKawgNsjZNzMnAPBaPdbg1VTTFSpTUuzW7cRvj",
      "Au6PnKa2PgaGn9EQ8DosSc5UiMMc5x93GMshoA91u25B",
      "HEgFxk7rAbXeNZHTBQAoQwsVFVF7xjvtKPJwF236atUN",
      "E99e4Fccfs2LdV3U2KUc6G5jZwMqbDk93BNAnFw2huUP",
      "Cjj7JkfExvzsZy9NbWhMo1MQQGeJ3KNAspgdBwGTz3FM",
      "CVocJWZDayvXVNQQ7rSEChGikzEpnxBNj5upCSUp8CMf",
      "DozRNS7AhkWFVGw59yMeiSC8hYw81idA7MweT2AW4kFB",
      "AFWqBUUGx8LqRrjUrt4ttduo4Rt6pRqQRDNoUtFRt3Uq",
      "GBQBi1Yh8ABUrLKvZ4tyh3VxAx9ryedZc6NFKjEE6NiF",
      "EteLLcweKSHbqP93ju29N83mPtkEf46EXMQozLWQp21Z",
      "DH9UJqbiEuccyw9rbwFm5ricWmoq1AREtQohNz9vFCZD",
      "BAMFZ8578NzaPAxA23nDgZoK1BN2CegxGzh6aVw32Yrb",
      "6YKt64vVWQXrrDaMnZgFZkCVGe8LC3DRgomQj1zs9UCZ",
      "2j66153H7chiKmgMfg9fe7smEgyZSzTCQoQzbM4kCFsP",
      "GevcSmjuGndtaiaw6eNhVtPutVc67XE81iwdeGYNs4NK",
      "EDCdDTQpZ4mLkVmh9hgeHbvD9hc4kP7BLrQviNGM6gay",
      "Eqd67mdC6PV5EzGSAqVvrwqBZsixmgXnQBj8aU8kHHak",
      "D6b5bJvVFszrvkDcxLptkd7FEJhYBdo586RkGvSkRcL1",
      "3SygvrbLxtywofShq5s1HpjhzBVeP5nmHdTGPn7wycRU",
      "2KkqfXqSN6rrayHLAtnTaaBPTELGY1yiL6nyBE6rBkgU",
      "9Ny9Bg9tiuWsmFSyNgzW6Eb6JjPqK8vZidVLpFZxQn6P",
      "7R7oKv4SA1yqBEJV7ULMUWfaRhD7pcnZ7AZju1VZHevc",
      "F9LKKsAc5pQ66PHkrGEyNhnro8CEgmt58DFBgx4it6aZ",
      "5vceHtsftYWspfbs35ztTP1cNztaDC8VeJWGVdct5dNu",
      "4XdoNjJtHGbybgbvgs95VBV7U5F3jeB15uiJaGFLB4vt",
      "3BP4mHPaZ4uxD3UGRRXi4Q1njRdBLFZrgyDmMRGkjWAV",
      "FwwqDQeZREv8EcTHrLS1jM9hWxzaETtzG5ckMmEApQ1n",
      "6nCDiKaWuMszqqbHZZrnvQk6XFb5DgPZzvYrLrbA64Qh",
      "6KRYrKxPUaeYz33K6XBXD62Duhm49NUgPXNvZ2Q3oW3C",
      "GvzvH84Mj3pG8cPDdqz2Kpq2NnFoYrt5gDBTCZd91Lc3",
      "CtHt6p7NnH36V4WDsJ5ryZicGxho4MJWRRYYiif5y9bj",
      "3Dt9vN9rRGEGqfS4H2hzCLY8NiAnTu5jmiKMBqxt5uLo",
      "4PzQDJ12E4knFAHjvEoebntjXfouXUogbgY6Hj3Hhr1c",
      "86Pc1rB95FFWwdxDgSb85bpy4mUEnYZTo5BR4S4SLSPR",
      "6LSZdBqJToLsW6CcGbyQrCXHqAPqjT3RoHd9L6JMori4",
      "EYELKmhPB7ZfZUpLbgsyXZye9zQe9JJ5n7s8R7Cn2VrD",
      "CwewQj4Rhe8bF7UAujoZivh6CZsMjosB49k5YEuqwbLk",
      "5akbCKNFjMEGP7QD7H8HwkcmvKjD8Z3t9gjZjKguLeTV",
      "AgvbAsktuf9TNmx3G1yseatVQmSSPUH8jrzbrr49NUce",
      "Ae6JfA3crFX2DbxPEH5vpGeJZMu3fW9jNen8FGj1CFdt",
      "3nX5QF3r2cWmtW3Cxb5qfHosoc2bvKpAtYv1578UVfM6",
      "boz48zJUcjiGNz7TzK95scGYGyaRWR9JFPVyWRFxjA1",
      "6pC22H4teZ4oQ2G8X9gi6e2cPktz9XkRViMe4vbAUAHh",
      "gZCBZ73q933z569QTHSCzJxkHJxz998aahEHo2dzvsG",
      "H2iRHqph7kzmR8gkE4oayaQC9BqwaQd6uovRTfaT9KMR",
      "J2JV9fH5avmuUaxuHAzrtvCpT6kv6YLgqUtBN6YFMsYf",
      "2va8Q5y2X9jTmjTa4kGh1ShDF4ntTEwwRwTkt9fForJH",
      "HcuGmQ3SB4VmZHpRt4ADxA4sA1uZ6dtATb6kRh8pSMLX",
      "8s4R3s4CGmjSm5jEgeSCr7GyMAqcrWJNiZ4JFiLcyify",
      "HBkXFTWdR9RUXsmS9zdw45fHp39N7Cg1dPN8FTAPoiF8",
      "AbETxYcgLfZWyyK7EDedo7qtT2cUCytS1TKQXUkbo6ms",
      "8GHi9Nr6cH1hwscTHeA9Vf13kfDWHJtJFUD5m3puVuuj",
      "HCoMbXUwZRZ1hA7cMmmdCebKiFKzj8a7J8o2WaKguGba",
      "DXX8bkSy4n6HgM4BAwX8GcsQPAjtJNPPStREC9i3D1ci",
      "8mMFiFnh37RZtH3WSQ9tLsR664VnG1iE6qKv2GMr31Sa",
      "69X6mwiKrG4JWV9xTbzcGoDsLPBh3Hc1gjPVkWVDsMwd",
      "5dk56WXY4aYnthsvBQQhC74sNfBapMV4njWKaVYNDSWx",
      "9smfhLaK37ooBRdREM5hedELDGuLexfkwjhSHyWmZRD3",
      "3GmQkWmbFKfHj3taDaGKM4Vwfzf2SysYwDw3tgxbM2QU",
      "HXNW7U4kM8pE4wqq4SbdvEDDgfyBBEsXGY7KrWsvhJPx",
      "EZ9hRY2hxUfD85wxjoPrcyjiLjtWoz7MUSz4av86ginu",
      "3sKratKdrbgHfMJJnwfrL8h1VaL6ebbyznTQT1vZCbH8",
      "5qrJMUtEbTSQEM2ZcKCVwjYaX8vBz9B764CBE5Evx8Dq",
      "5GuMqVdRG2wmgKBs6S5c1Eris85Jikb9MoDpXtaMQJqC",
      "EWYxpSm17GQrcyHJ5LBis8YGdrR49QMC5MCNwvzA61qv",
      "9Yk3i43GifNU71e2B5JSYDCPrYdqh4Mg6GXkaHcZpJ7o",
      "3JYELJiQQ3YUBvrokJSYSknnWhFs3X6tqw4KJCgWDxyH",
      "3nGhVjepHXp4vHyfYcLDUf8QdzhT3RXJNYC8Cb7Mkipm",
      "6aERFL4Yw5Z5pp55gJeyVMuvopbiniYLwJgfJjRsV7YN",
      "5PxUxhoyJyQ6vABRLBm4Mzy4pYTxWow6jmUvQfjhLVTC",
      "GARAijDXmQxBGvrhS6rqbsA8wbJc956epkR9vNapSBfC",
      "5Mqw2a6cdmriDavUgoYN6ntcGETfMCgW74AD2ZqdBNvM",
      "CUjF7mEsytKRYQVwsUv1kTRLcvugyqrGBidmL846siCC",
      "7ikth5AGDCe7YRMndrvNVsaLHWj2TQvESXzGBWVcgYGM",
      "BxMaBaApxRwX68VG2vNKDi7TdUXt5AwbY8MiAbkBkiJM",
      "7LtRpxZsrqnNwR2ZDYQZYrMTUoACTyUrNG5eaZPVrwRv",
      "2Ru82hPi1QEtHtwm5zGSqukBuWMSf2H8gBtuBdjhKJhb",
      "27wYWmDcH3WdbFBgAQnpw23k59ta9JhunU1qcsRwyiTE",
      "AMScRnuDQFABZ7cP5eEsU6bdBzvRVvj7xxSxMmj8yotK",
      "DKZvJNmPbdtCRm9niETe1HXoo2nmktKX5ZYsMukTcg4E",
      "7zTYpZz29LmYQHEQ2CFd8QECTfJUXd4U9iiqw7CxqRim",
      "6nFY4jMdHsaKHDJ6BGswa15e9Cmn1mh8FPQTS2tk6pgp",
      "57CwG8eCTRSqkM9Mpq5mKPwK7tcLWfXVLG1nAUiJuxXm",
      "53V21dPp5pdtz8MWxDWArkuqvVYVEFKaxWLTXZeBf5Hw",
      "HKvSkKqouj5cYU3UkUouB1QmdqvAz8RM4jvUndgxyaCq",
      "FCvMYFGsXPP3XYSAbRnRitDq1RsBxmrZf5qVxjU2df1B",
      "oTjNWT74ouQYEyzhxzym1w7ASUbpi6tqjGH9SKUBm59",
      "fqohAMUrQ2q45TtHj1FGL84d138a5uZ3z4GPQ6Thcgt",
      "HJcuYg4zEEgrYwEtPwYv1o4nk8xpJaCyVyzbs143WTNe",
      "EvVCwRgPYgbwi1MmBbXL7Yw9c5DwddkC1WVx7VqaSEj9",
      "HGo1Wgdvgn6sSVhMUKMR2AFrHxEKhyTr2ixMnodqLdYq",
      "876gjZHccenbyXKGcNeeff7qn7aFFsM6bQxDc9QrZn22",
      "GhKPNY3JdZ1YV8ghSgRB5PNrqpJUhdJCy2o3XUSykUz3",
      "7PbetPM6nixA8eiKZ87UmbzDbmRTBqYCCBYYbhupWgfn",
      "6kZNDsmkEWi7zqdng3y41npGGy9BKg2p1UNTS846G4d",
      "ETwg4z8UtJvYh8pD3WXTsJ1xEw8KihER8pBKF2PSoRGA",
      "A5ZAqVmAqLA8DQxKzkzAzALx9FyeyS4esvi4d7n9HXYi",
      "9Aob5aMF6k5WbG4g9y3qukVfsPkusctEwCyoGnkYz7rp",
      "4P1WWZu2qA1kzmTxbYo3z563Q63z83Q21ncX4jQJgStA",
      "4F7pczdQPgiHtxq29auxE6jDY7chaAcwmdJ99AKKpkyE",
      "EdsHgzYeUZmsnfbYD8RL5kg4GhtPZx3sUVaorywAmxn",
      "CsJZdTpKU3UY6fVGgjXiByQAo8MfkAjUny7zBKm8s9jL",
      "8mX6T6jpBKpa969XZnn9TqucXwna8bV1pCkw2HsgwCTo",
      "5AxCobcdmdhjeY9iTLFGetYNx9Z5TgY7rQH97RRRS79U",
      "65wxLBESRAmxNpYseBoimRcoGRVjZfPXiP1u8Pqs5naN",
      "2VAuYWvinkKy8dZtGh8zNVqPDyz6GL4YsKNdLcmdi86Q",
      "Y8SBGnaZNpvd3WwiaLKj131PPQebH2Hfv2jYarnTpns",
      "6hcVJBUNi7CVox2KHVDRCsHkxyhnz86RbYKknLXUdGxE",
      "2SHXpAd4sbEKqEA2Bf6FXpuKqxRZYiyCSwDC36N5rZYt",
      "71AqKERqQXVFsY11j2m8cvjXrJy3bM7UCwoXhu9iqjQx",
      "DUn27EXn8ACvtE96BTDH7qWUaeaD4hwvxue9PYdqML7P",
      "FDSzCFaZsLu5VqnZNHHtkFcNeSdVHzVay38pXHz2hgrB",
      "HHHTvGkvb17tGT9NQacdsdTHKzCnXw2oiB2FgMSQY3Mz",
      "4nP2W1pKF9E5BtKuydVVYRRkj2SvPsb4WNzhsd5R7VAc",
      "5Bv5NGeahMxwgz5LPBjR23XF2cSrbo6gHP3TcBsZkt9e",
      "GwW226mt63gb1xwnmwFRAru6oLcWfjk4BojG6RKb8gtL",
      "Gvms42fFkupXvbaHxLok7AJAHiERSGjec2JTsK8qAB6q",
      "GeS79yyt8kk3dt1ZtQmFMrASHrZJvkqBiSsvMUQ3qTKE",
      "7w3VKFUHu9wbN4CWWU874MDksBzZuDnsHVgJwurcksCQ",
      "8wBm1HB4R9WGcHTZBRNR3QxXqd6BpqMTzc5oq1KvzFmt",
      "Dmqp1Ti9QZs5CqcwZr1yqD67NMa1QgwPsWiqw1zvVcqw",
      "HCFnY6Bhu8gwQYkzptuxsJ4zbZC4vJrCgzbzCzwVSLUb",
      "Heknz9ECGbiFZWWxATvFZLFZzFHc7kKb7ZRNp9Fjqsqu",
      "ErTLMFdbYj8R3jpPyJ7uuBtdCVmDvxBASQ9htAMemJnQ",
      "DRWSkJP2NbPFk9JBqyS9warAVK1nh44inWG7UyDCo78E",
      "FBUr2NWLT6LPKEkDnAwvc3sUcZYhnzyMXFpvjgoPHMZe",
      "CdkSj8259gLCYP5B5sek2Mawm1ENc2X3ThfWX9jUfR1w",
      "Dz9qgVGGdxwmqeoUjcCwnTPvwNUPJRq3LJLFGeEy2rP8",
      "9Db49v2zyxQecGo45qtDvQgqDak6gZzYZmok3dzEuoms",
      "EkJNJQnTKdyVLF4fcnyR2PQDdmD5FDWzVVo5DKMZ1tbP",
      "6g5LAays7iWt3fcb74xuiTMDGKT3NFF2hijv7LqHKrNj",
      "AxqUj6FnBqDr5MQjLTJGfd1ThAbAxvBHtRKWpHvM7YTW"
    ]              
    const hasSpecifiedNFT = nftHoldings.filter(nft => mints.includes(nft.mintAddress.toString()));
    
    let canPayFor = hasSpecifiedNFT.length || 0;
    if (!canPayFor) states.messages.push(`Not enough of or no NFTs to burn.`);

    states.canPayFor = Math.max(states.canPayFor, canPayFor);
  }

  // Check for gates
  if (guards.gate?.token) {
    const tokenAccount = tokenHoldings.find((x) =>
      x.mint.equals(guards.gate?.token.mint)
    );
    let canPayFor =
      tokenAccount && tokenAccount.balance > guards.gate?.token.amount ? 10 : 0;
    if (!canPayFor)
      states.messages.push(
        `Don't have enough ${
          guards.gate?.token.symbol || "token"
        } to pass gate.`
      );
    states.canPayFor = Math.max(states.canPayFor, canPayFor);
  }

  if (guards.gate?.nfts) {
    let canPayFor = guards.burn?.nfts.length ? 10 : 0;
    if (!canPayFor)
      states.messages.push(`Not enough of or no NFTs to pass the gate.`);
    states.canPayFor = Math.max(states.canPayFor, canPayFor);
  }

  // Check for whitelisted addresses
  if (guards.allowed) {
    states.isWalletWhitelisted = !!guards.allowed.find((x) =>
      x.equals(walletAddress)
    );
    if (!states.isWalletWhitelisted)
      states.messages.push(`Not whitelisted for this mint.`);
  }

  if (guards.gatekeeperNetwork) {
    states.hasGatekeeper = true;
  }

  return states;
};
export const tokenSymbolCaches: {
  [k: string]: Promise<void | SplTokenCurrency>;
} = {};

export const updateTokenSymbolAndDecimalsFromChainAsync = async (
  mx: Metaplex,
  token: TokenPayment$Gate
) => {
  const chacheKey = token.mint.toString();
  if (!tokenSymbolCaches[chacheKey]) {
    tokenSymbolCaches[chacheKey] = mx
      .tokens()
      .findMintByAddress({ address: token.mint })
      .then((mint) => mint.currency)
      .catch(() => {
        delete tokenSymbolCaches[chacheKey];
      });
  }
  const res = await tokenSymbolCaches[chacheKey];
  if (res) {
    token.decimals = res.decimals;
    token.symbol = res.symbol;
  }
};

export const guardToLimitUtil = (
  guards: GuardGroup,
  defaultLimit: number = 10
): number =>
  (guards.payment?.nfts
    ? guards.payment.nfts.length
    : guards.burn?.nfts
    ? guards.burn.nfts.length
    : guards.gate?.nfts
    ? guards.gate.nfts.length
    : guards.redeemLimit) ||
  (guards.mintLimit?.settings?.limit
    ? guards.mintLimit?.settings?.limit -
      (guards.mintLimit?.mintCounter?.count || 0)
    : defaultLimit);