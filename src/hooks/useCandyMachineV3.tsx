import {
  callCandyGuardRouteBuilder,
  CandyGuardsSettings,
  CandyMachine,
  getMerkleProof,
  getMerkleTree,
  IdentitySigner,
  Metadata,
  Metaplex,
  mintFromCandyMachineBuilder,
  Nft,
  NftWithToken,
  PublicKey,
  Sft,walletAdapterIdentity  as wallie,
  SftWithToken,
} from "@metaplex-foundation/js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';

import { getAssociatedTokenAddress, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import React, { useEffect } from "react";
import { MerkleTree } from "merkletreejs";
import {
  AllowLists,
  CustomCandyGuardMintSettings,
  GuardGroup,
  GuardGroupStates,
  NftPaymentMintSettings,
  ParsedPricesForUI,
  Token,
} from "./types";
import {
  fetchMintLimit,
  guardToPaymentUtil,
  mergeGuards,
  parseGuardGroup,
  parseGuardStates,
} from "./utils";
import fs from 'fs';
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchCandyGuard, mintV2, MPL_CANDY_MACHINE_CORE_PROGRAM_ID, mplCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { generateSigner, publicKey, sol,  TransactionBuilder,
  some, 
  none,
  transactionBuilder} from "@metaplex-foundation/umi";
import { burnNft, MintArgsArgs, TokenStandard,findTokenRecordPda } from "@metaplex-foundation/mpl-token-metadata";
import { createAssociatedToken, createMint, getAccountMetasAndSigners, setComputeUnitLimit, setComputeUnitPrice } from "@metaplex-foundation/mpl-toolbox";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export default function useCandyMachineV3(
  statusMessage: string,
  setStatusMessage: (message: string) => void,
  candyMachineId: PublicKey | string,
  candyMachineOpts: {
    assetPayment?: {
      requiredAsset: PublicKey;
      destination: PublicKey;
      amount: { basisPoints: bigint; currency: { symbol: string; decimals: number } };
    };
    assetBurn?: {
      requiredAsset: PublicKey;
      amount: { basisPoints: bigint; currency: { symbol: string; decimals: number } };
    };
    nftBurn?: {
      collection: PublicKey;
    };
    solPayment?: {
      amount: { basisPoints: bigint; currency: { symbol: string; decimals: number } };
      destination: PublicKey;
    };
  } = {}
) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [guardsAndGroups, setGuardsAndGroups] = React.useState<{
    default?: GuardGroup;
    [k: string]: GuardGroup;
  }>({});

  const [status, setStatus] = React.useState({
    candyMachine: false,
    guardGroups: false,
    minting: false,
    initialFetchGuardGroupsDone: false,
  });

  const [balance, setBalance] = React.useState(0);
  const [allTokens, setAllTokens] = React.useState<Token[]>([]);
  const [nftHoldings, setNftHoldings] = React.useState<Metadata[]>([]);

  const tokenHoldings = React.useMemo<Token[]>(() => {
    if (!nftHoldings || !allTokens?.length) return [];
    return allTokens.filter(
      (x) => !nftHoldings.find((y) => x.mint.equals(y.address))
    );
  }, [nftHoldings, allTokens]);

  const [candyMachine, setCandyMachine] = React.useState<CandyMachine>(null);
  const [items, setItems] = React.useState({
    available: 0,
    remaining: 0,
    redeemed: 0,
  });

  const mx = React.useMemo(
    () => connection && Metaplex.make(connection),
    [connection]
  );

  const proofMemo = React.useMemo(() => {
    return {
      merkles: {},
      verifyProof() {
        return true;
      },
    };
  }, [wallet.publicKey]);

  const fetchCandyMachine = React.useCallback(async () => {
    return await mx.candyMachines().findByAddress({
      address: new PublicKey(candyMachineId),
    });
  }, [candyMachineId]);

  const refresh = React.useCallback(async () => {
    if (!wallet.publicKey) throw new Error("Wallet not loaded yet!");

    setStatus((x) => ({ ...x, candyMachine: true }));
    await fetchCandyMachine()
      .then((cndy) => {
        setCandyMachine(cndy);
        setItems({
          available: cndy.itemsAvailable.toNumber(),
          remaining: cndy.itemsRemaining.toNumber(),
          redeemed: cndy.itemsMinted.toNumber(),
        });

        return cndy;
      })
      .catch((e) => console.error("Error while fetching candy machine", e))
      .finally(() => setStatus((x) => ({ ...x, candyMachine: false })));
  }, [fetchCandyMachine, wallet.publicKey]);

    // Check if they hold something from the specified JSON file
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
  const determineGroup = React.useCallback(async () => {
    if (!wallet.publicKey) return "sol";
       
    const hasSpecifiedNFT = nftHoldings.some(nft => mints.includes(nft.mintAddress.toString()));
    if (hasSpecifiedNFT) return "nft";

    // Check if they hold 1.38m fomo3d
    const fomo3dHolding = tokenHoldings.find(token => token.mint.toString() === "BQpGv6LVWG1JRm1NdjerNSFdChMdAULJr3x9t2Swpump");
    if (fomo3dHolding && fomo3dHolding.balance >= 1_380_000_000_000) return "tPay";

    // Check if they hold 1m tokens
    const hasMillionTokens = fomo3dHolding && fomo3dHolding.balance >= 1_000_000_000_000;
    if (hasMillionTokens) return "tBurn";
    const balance = await mx.rpc().getBalance(wallet.publicKey);
    if (balance.basisPoints.toNumber() >= 66.6 * 10 ** 9) return "sol";

    // Default to sol payment
    return "none";
  }, [wallet.publicKey, nftHoldings, tokenHoldings]);
  const determineStatusMessage = async (group: string) => {
    if (group === "sol") return 'You have 66.6 SOL! Mint by SOL.';
    if (group === "tBurn") return 'You have 1m tokens! Mint by burning.';
    if (group === "tPay") return 'You have 1.38m tokens! Mint by donation.';
    if (group === "nft") return 'You have a Mage NFT! Mint by migrating.';
    return 'You have not 66.6 sol, fomo3d mages or 1m+ fomo3d tokens! Mint by acquiring somne.';
  };
  useEffect(() => {
    const updateStatus = async () => {
      if (!wallet.publicKey) return;


      const group = await determineGroup();
      const statusMessage = await determineStatusMessage(group);
      setStatusMessage(statusMessage);
    };

    updateStatus();
  }, [wallet.publicKey, nftHoldings, tokenHoldings, balance]);

  const mint = React.useCallback(
    async (
      quantityString: number = 1,
      opts: {
        groupLabel?: string;
        nftGuards?: NftPaymentMintSettings[];
      } = {}
    ) => {
      const group = await determineGroup();
      console.log("group", group);
      const umi = createUmi(connection.rpcEndpoint)
      umi.use(walletAdapterIdentity(wallet))
      
         .use(mplCandyMachine())
      let nfts: (Sft | SftWithToken | Nft | NftWithToken)[] = [];
      try {
        if (!candyMachine) throw new Error("Candy Machine not loaded yet!");

        setStatus((x) => ({
          ...x,
          minting: true,
        }));

        const transactionBuilders: any[] = [];
        for (let index = 0; index < quantityString; index++) {
          const nftMint = generateSigner(umi);
          console.log("nftMint", nftMint);
          const selectedNftMint = nftHoldings.find(nft => mints.includes(nft.mintAddress.toString()));

          let stuff = {
            candyMachine,
            collectionUpdateAuthority: candyMachine.authorityAddress, // mx.candyMachines().pdas().authority({candyMachine: candyMachine.address})
            group: opts.groupLabel,
            guards: {}
          }
          if (opts.groupLabel === 'default') {
            stuff.guards = {
              nftBurn: {
                requiredCollection: new PublicKey("ABzeJwkZqMcvPNz7uYX95zoNpreDsNscsUthsEYd6S1k")
              }
            }
          } else if (opts.groupLabel === 'sol') {
            stuff.guards = {
              solPayment: {
                value: 66.6 * LAMPORTS_PER_SOL,
                destination: new PublicKey("99VXriv7RXJSypeJDBQtGRsak1n5o2NBzbtMXhHW2RNG")
              }
            }
          } else if (opts.groupLabel === 'tokenBurn') {
            stuff.guards = {
              tokenBurn: {
                amount: 1_380_000_000_000,
                mint: new PublicKey("BQpGv6LVWG1JRm1NdjerNSFdChMdAULJr3x9t2Swpump")
              }
            }
          } else if (opts.groupLabel === 'tokenPayment') {
            stuff.guards = {
              tokenPayment: {
                amount: 1_000_000_000_000,
                mint: new PublicKey("BQpGv6LVWG1JRm1NdjerNSFdChMdAULJr3x9t2Swpump"),
                destinationAta: new PublicKey("9Jt5FeYGoEQcWB1DSwnTLbwjuEaUoGC1CmJyqdV4CLNw")
              }
            }
          }
console.log("stuff", stuff)
const mint = generateSigner(umi)
const tx = await transactionBuilder()
  .add(setComputeUnitLimit(umi, { units: 1_400_000 }))
  .add(setComputeUnitPrice(umi, { microLamports: 333333 }))
  .add(
    mintV2(umi, {
      nftMint: mint,
      candyMachine: publicKey(candyMachine.address),
       // @ts-ignore
      candyGuard: candyMachine.candyGuard.address,
      collectionMint: publicKey(candyMachine.collectionMintAddress),
      collectionUpdateAuthority: publicKey("99VXriv7RXJSypeJDBQtGRsak1n5o2NBzbtMXhHW2RNG"),
      group: await determineGroup(),
     mintArgs: {
        nftBurn: some({
          requiredCollection: publicKey("ABzeJwkZqMcvPNz7uYX95zoNpreDsNscsUthsEYd6S1k"),
          mint: publicKey(selectedNftMint.mintAddress),
          tokenStandard: TokenStandard.NonFungible,
        })
      },
        }).addRemainingAccounts({
      pubkey: findTokenRecordPda(umi, {
        mint: publicKey(selectedNftMint.mintAddress),
        token: publicKey(getAssociatedTokenAddressSync(new PublicKey(selectedNftMint.mintAddress), new PublicKey(wallet.publicKey), true, TOKEN_PROGRAM_ID))
      })[0],
      isWritable: true,
      isSigner: false
    })
  )
  

const signedTx = await tx.buildAndSign(umi);
const signature = await umi.rpc.sendTransaction(signedTx, {
  skipPreflight: false,
  maxRetries: 3,
});

await umi.rpc.confirmTransaction(signature, {
  strategy: { type: 'blockhash', ...(await umi.rpc.getLatestBlockhash()) },
});

transactionBuilders.push(signature);
console.log(transactionBuilders)
    
        } 
     
        nfts = await Promise.all(
          transactionBuilders.map((tx) =>
        umi.rpc.getTransaction(tx).then((transaction) => {
          const nftMint = new PublicKey(transaction.message.accounts[1]);
          return mx.nfts().findByMint({ mintAddress: nftMint });
        })
      )
    );
        Object.values(guardsAndGroups).forEach((guards) => {
          if (guards.mintLimit?.mintCounter)
            guards.mintLimit.mintCounter.count += nfts.length;
        });
      } catch (error: any) {
        let message = error.msg || "Minting failed! Please try again!";
        if (!error.msg) {
          if (!error.message) {
            message = "Transaction Timeout! Please try again.";
          } else if (error.message.indexOf("0x138")) {
          } else if (error.message.indexOf("0x137")) {
            message = `SOLD OUT!`;
          } else if (error.message.indexOf("0x135")) {
            message = `Insufficient funds to mint. Please fund your wallet.`;
          }
        } else {
          if (error.code === 311) {
            message = `SOLD OUT!`;
          } else if (error.code === 312) {
            message = `Minting period hasn't started yet.`;
          }
        }
        console.error(error);
        throw new Error(message);
      } finally {
        setStatus((x) => ({ ...x, minting: false }));
        refresh();
        return nfts.filter((a) => a);
      }
    },
    [candyMachine, guardsAndGroups, mx, wallet?.publicKey, refresh, determineGroup]
  );

  React.useEffect(() => {
    if (!mx || !wallet.publicKey) return;
    console.log("useEffact([mx, wallet.publicKey])");
    mx.use(wallie(wallet));
    
    mx.rpc()
      .getBalance(wallet.publicKey)
      .then((x) => x.basisPoints.toNumber())
      .then(setBalance)
      .catch((e) => console.error("Error to fetch wallet balance", e));

    mx.nfts()
      .findAllByOwner({
        owner: wallet.publicKey,
      })
      .then((x) =>
        setNftHoldings(x.filter((a) => a.model == "metadata") as any)
      )
      .catch((e) => console.error("Failed to fetch wallet nft holdings", e));

    (async (walletAddress: PublicKey): Promise<Token[]> => {
      const tokenAccounts = (
        await connection.getParsedTokenAccountsByOwner(walletAddress, {
          programId: TOKEN_PROGRAM_ID,
        })
      ).value.filter(
        (x) => parseInt(x.account.data.parsed.info.tokenAmount.amount) > 1
      );

      return tokenAccounts.map((x) => ({
        mint: new PublicKey(x.account.data.parsed.info.mint),
        balance: parseInt(x.account.data.parsed.info.tokenAmount.amount),
        decimals: x.account.data.parsed.info.tokenAmount.decimals,
      }));
    })(wallet.publicKey).then(setAllTokens);
  }, [mx, wallet.publicKey]);

  React.useEffect(() => {
    refresh().catch((e) =>
      console.error("Error while fetching candy machine", e)
    );
  }, [refresh]);

  React.useEffect(() => {
    const walletAddress = wallet.publicKey;
    if (!walletAddress || !candyMachine) return;
    console.log(
      "useEffact([mx, wallet, nftHoldings, candyMachine])"
    );

    (async () => {
      const guards = {
        default: await parseGuardGroup(
          {
            guards: candyMachine.candyGuard.guards,
            candyMachine,
            nftHoldings,
            walletAddress,
            tokenHoldings,
            label: "default",
          },
          mx
        ),
      };
      
      // Use candyMachine.candyGuard.guards as the source of truth
      if (candyMachine.candyGuard.guards) {
        await Promise.all(
          candyMachine.candyGuard.groups.map(async (x) => {
            guards[x.label] = await parseGuardGroup(
              {
                guards: mergeGuards([candyMachine.candyGuard.guards, x.guards]),
                label: x.label,
                candyMachine,
                nftHoldings,
                walletAddress,
                tokenHoldings,
              },
              mx
            );
          })
        );
      }
      
      console.log("Guards:", guards);
      setGuardsAndGroups((prevGuards) => ({
        ...prevGuards,
        ...guards
      }));
    })();
  }, [wallet.publicKey, nftHoldings, candyMachine]);

  const prices = React.useMemo((): {
    default?: ParsedPricesForUI;
    [k: string]: ParsedPricesForUI;
  } => {
    return Object.entries(guardsAndGroups).reduce(
      (groupPayments, [label, guards]) => {
        return Object.assign(groupPayments, {
          [label]: guardToPaymentUtil(guards),
        });
      },
      {}
    );
  }, [guardsAndGroups]);

  const guardStates = React.useMemo((): {
    default?: GuardGroupStates;
    [k: string]: GuardGroupStates;
  } => {
    return Object.entries(guardsAndGroups).reduce(
      (groupPayments, [label, guards]) =>
        Object.assign(groupPayments, {
          [label]: parseGuardStates({
            guards: guards,
            candyMachine,
            walletAddress: wallet.publicKey,
            tokenHoldings,
            balance,
            nftHoldings,
          }),
        }),
      {}
    );
  }, [guardsAndGroups, tokenHoldings, balance]);

  React.useEffect(() => {
    console.log({ guardsAndGroups, guardStates, prices });
  }, [guardsAndGroups, guardStates, prices]);

  return {
    candyMachine,
    guards: guardsAndGroups,
    guardStates,
    status,
    items,
    prices,
    mint,
    refresh,
  };
}
