import fs from 'fs'
import path from 'path'

import chainSpec from 'data/chainspec.json'
import matter from 'gray-matter'
import type { NextPage } from 'next'
import getConfig from 'next/config'
import Head from 'next/head'
import { serialize } from 'next-mdx-remote/serialize'
import { IItemDocs, IGasDocs, IDocMeta, IReferenceItem } from 'types'

import ContributeBox from 'components/ContributeBox'
import HomeLayout from 'components/layouts/Home'
import ReferenceTable from 'components/Reference'
import { H1, Container } from 'components/ui'

const { serverRuntimeConfig } = getConfig()

const opcodeRewrites: { [key: string]: string } = {
  ret: 'ret_contract',
  rvrt: 'rvrt_contract',
  retd: 'retd_contract',
  cfe: 'cfei',
  cfs: 'cfsi',
  ecal: 'call',
}

const HomePage = ({
  opcodeDocs,
  gasDocs,
  instructions,
}: {
  opcodeDocs: IItemDocs
  gasDocs: IGasDocs
  instructions: any[]
}) => {
  const opcodes = instructions.map((instruction): IReferenceItem => {
    const opcodeRewritten =
      opcodeRewrites[instruction.opcode.toLowerCase()] ||
      instruction.opcode.toLowerCase()
    const costItem = (chainSpec.consensus_parameters.V1.gas_costs.V1 as any)[
      opcodeRewritten
    ]
    if (!costItem) {
      console.error(`Missing gas cost for ${instruction.opcode}`)
    }

    return {
      name: instruction.opcode,
      opcodeOrAddress: instruction.instruction,
      description: instruction.description,
      input: instruction.registers
        .map((register: any) => register.name)
        .join(' | '),
      output: '',
      minimumFee:
        costItem.LightOperation?.base ||
        costItem.HeavyOperation?.base ||
        costItem,
    }
  })
  console.log(opcodes)

  return (
    <>
      <Head>
        <meta property="og:type" content="website" />
        <meta property="og:title" content="EVM Codes - Opcodes" />
        <meta
          name="description"
          content="A Fuel Virtual Machine Opcodes Interactive Reference"
        />
      </Head>
      <Container>
        <H1>
          A Fuel Virtual Machine Virtual Machine <br></br> Opcodes Interactive
          Reference
        </H1>
        <div style={{ textAlign: 'center' }}>
          Forked from{' '}
          <a href="https://www.evm.codes/" target="_blank" rel="noreferrer">
            evm.codes
          </a>
        </div>
      </Container>

      <section className="py-10 md:py-20 bg-gray-50 dark:bg-black-700">
        <Container>
          <ReferenceTable
            reference={opcodes}
            itemDocs={opcodeDocs}
            gasDocs={gasDocs}
          />
        </Container>
      </section>

      <section className="pt-20 pb-10 text-center">
        <ContributeBox />
      </section>
    </>
  )
}

HomePage.getLayout = function getLayout(page: NextPage) {
  return <HomeLayout>{page}</HomeLayout>
}

export const getStaticProps = async () => {
  const docsPath = path.join(serverRuntimeConfig.APP_ROOT, 'docs/opcodes')
  const docs = fs.readdirSync(docsPath)

  const opcodeDocs: IItemDocs = {}
  const gasDocs: IGasDocs = {}

  const instructionsRs = await fetch(
    'https://github.com/FuelLabs/fuel-vm/raw/master/fuel-asm/src/lib.rs',
  ).then((res) => res.text())
  const instructions = []
  const iterator = instructionsRs.matchAll(
    /"(.+)"\s+0x(\w+) (\w+) (\w+) \[(.+)\]/g,
  )
  for (const [
    ,
    description,
    instruction,
    opcode,
    opcodeSmall,
    registers,
  ] of iterator) {
    const registerList = Array.from(registers.matchAll(/(\w+): (\w+)/g)).map(
      ([, name, type]) => ({ name, type }),
    )
    instructions.push({
      description,
      instruction,
      opcode,
      registers: registerList,
      opcodeSmall,
    })
  }

  await Promise.all(
    docs.map(async (doc) => {
      const stat = fs.statSync(path.join(docsPath, doc))
      const opcode = path.parse(doc).name.toLowerCase()

      try {
        if (stat?.isDirectory()) {
          fs.readdirSync(path.join(docsPath, doc)).map((fileName) => {
            const markdown = fs.readFileSync(
              path.join(docsPath, doc, fileName),
              'utf-8',
            )
            const forkName = path.parse(fileName).name
            if (!(opcode in gasDocs)) {
              gasDocs[opcode] = {}
            }
            gasDocs[opcode][forkName] = markdown
          })
        } else {
          const markdownWithMeta = fs.readFileSync(
            path.join(docsPath, doc),
            'utf-8',
          )
          const { data, content } = matter(markdownWithMeta)
          const meta = data as IDocMeta
          const mdxSource = await serialize(content)

          opcodeDocs[opcode] = {
            meta,
            mdxSource,
          }
        }
      } catch (error) {
        console.debug("Couldn't read the Markdown doc for the opcode", error)
      }
    }),
  )
  return {
    props: {
      opcodeDocs,
      gasDocs,
      instructions,
    },
  }
}

export default HomePage
