import { Cartao } from "@/components/ui";

export const metadata = { title: "Ajuda — Compras Express" };

export default function Ajuda() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 leading-relaxed">
      <h1 className="text-3xl font-bold">Ajuda</h1>

      <Cartao titulo="Como usar, no dia a dia">
        <ol className="list-decimal pl-6 space-y-1.5">
          <li>Na tela inicial, clique em <b>Começar novo lote</b>.</li>
          <li>Arraste todas as notas e prints de uma vez (ou cole um print com Ctrl+V).</li>
          <li>Espere a barra azul chegar ao fim. Arquivos com problema aparecem em vermelho, no topo.</li>
          <li>
            Clique em <b>Aprovar todos os verdes</b>. Depois marque <b>Mostrar só o que precisa conferir</b> e veja as linhas amarelas e
            vermelhas, comparando com o documento ao lado.
          </li>
          <li>Corrija direto na célula, se precisar, e marque a caixinha de aprovar.</li>
          <li>Clique em <b>Lançar na planilha</b>. Pronto!</li>
          <li>Errou? Na tela inicial, <b>Desfazer último lote</b> remove só as linhas daquele lote.</li>
        </ol>
      </Cartao>

      <Cartao titulo="O que as cores querem dizer">
        <ul className="space-y-1.5">
          <li>🟢 <b>Verde</b>: tudo conferiu (soma, CNPJ, data, campos preenchidos, leitura com segurança).</li>
          <li>🟡 <b>Amarelo</b>: confira — falta algum dado, a leitura ficou incerta, a soma não bate ou o app corrigiu sozinho.</li>
          <li>
            🔴 <b>Vermelho</b>: erro (CNPJ inválido, data no futuro) ou <b>duplicata</b> (já lançada ou repetida). Não é lançada, a menos que você
            clique em “Lançar mesmo assim”.
          </li>
        </ul>
      </Cartao>

      <Cartao titulo="Regras que o app sempre segue">
        <ul className="list-disc pl-6 space-y-1">
          <li>Nunca inventa valor: o que não dá para ler fica vazio e amarelo.</li>
          <li>Nunca grava sem a sua aprovação.</li>
          <li>Nunca apaga nem sobrescreve o que já está na planilha: só acrescenta linhas no fim da tabela (antes da linha de totais).</li>
          <li>Não escreve em colunas com fórmula.</li>
          <li>Enviar o mesmo arquivo ou o mesmo lote de novo não duplica linhas.</li>
          <li>Cada linha lançada guarda o nome do arquivo de origem e o ID do lote.</li>
        </ul>
      </Cartao>

      <Cartao titulo="Privacidade: o que sai deste computador">
        <ul className="list-disc pl-6 space-y-1.5">
          <li>
            <b>Para o Google</b> (sua conta): as linhas aprovadas, gravadas na sua planilha. O app também lê a planilha para achar
            duplicatas e sugerir nomes.
          </li>
          <li>
            <b>Para a IA (Anthropic, Claude)</b>: só o conteúdo das fotos, prints e PDFs, para ler os dados. XML de NF-e é lido aqui mesmo e
            não vai para a IA. Do PDF com texto vai só o texto, com CPF e nome de paciente apagados antes do envio. O nome do arquivo não é
            enviado.
          </li>
          <li>
            <b>Fica só aqui</b>: os arquivos enviados (apagados automaticamente depois do prazo configurado), o histórico e as correções.
          </li>
          <li>O app nunca guarda nem lança nome, CPF, prontuário ou cartão SUS de pacientes.</li>
          <li>O app só abre neste computador (endereço “localhost”); ninguém de fora consegue acessar.</li>
        </ul>
      </Cartao>

      <Cartao titulo="Configuração (primeira vez)">
        <p>
          O passo a passo completo — criar o projeto no Google Cloud (passo 2), obter a chave da IA (passo 3) e iniciar o app — está no
          arquivo <b>README.md</b>, na pasta do app. Peça ajuda a alguém de TI na primeira vez, se preferir; depois é só dar dois cliques
          em <b>iniciar</b>.
        </p>
      </Cartao>
    </div>
  );
}
