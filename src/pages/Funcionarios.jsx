import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Card from '../components/Card'
import Input from '../components/Input'
import Select from '../components/Select'
import DateField from '../components/DateField'
import Button from '../components/Button'
import EncargosPie from '../components/EncargosPie'
import { labelCpfCnpj, formatCpfCnpj, onlyDigits, isValidCPF, isValidCNPJ } from '../utils/br'
import { format, differenceInDays, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { parseYMD } from '../calc/date'
import { calcularFuncionario, aggregateByVerba } from '../calc/compute'
import { upsertEmployee } from '../data/employees'
import { useAuth } from '../auth/AuthContext'

const ENCARGOS_POR_SETOR = {
  comercio: { inss: 0.20, fgts: 0.08, terceiros: 0.058, rat: 0.02 },
  industria:{ inss: 0.20, fgts: 0.08, terceiros: 0.038, rat: 0.03 },
  servicos: { inss: 0.20, fgts: 0.08, terceiros: 0.048, rat: 0.01 }
}

function calcularEncargosProvisoesMensais(funcionario, mes) {
  const salarioBase = parseFloat(funcionario.salarioBase)
  const encargosSetor = ENCARGOS_POR_SETOR[funcionario.setor]
  const inicio = startOfMonth(mes)
  const fim = endOfMonth(mes)
  const dataEntrada = parseYMD(funcionario.dataEntrada)
  const dataSaida = funcionario.dataSaida ? parseYMD(funcionario.dataSaida) : new Date()
  if (dataEntrada > fim || (dataSaida && dataSaida < inicio)) return null
  const inicioEfetivo = dataEntrada > inicio ? dataEntrada : inicio
  const fimEfetivo = dataSaida && dataSaida < fim ? dataSaida : fim
  const diasTrabalhados = differenceInDays(fimEfetivo, inicioEfetivo) + 1
  const mesCompleto = diasTrabalhados >= 15
  // Proporção sempre por dias/30 (sem regra dos 15 para encargos)
  const proporcao = Math.min(1, diasTrabalhados / 30)
  const encargos = {
    inss: salarioBase * encargosSetor.inss * proporcao,
    fgts: salarioBase * encargosSetor.fgts * proporcao,
    terceiros: salarioBase * encargosSetor.terceiros * proporcao,
    rat: salarioBase * encargosSetor.rat * proporcao
  }
  const provisoes = {
    decimoTerceiro: mesCompleto ? salarioBase / 12 : 0,
    ferias: mesCompleto ? salarioBase / 12 : 0,
    tercoFerias: mesCompleto ? (salarioBase / 12) / 3 : 0,
  }
  provisoes.fgtsProvisoes = (provisoes.decimoTerceiro + provisoes.ferias + provisoes.tercoFerias) * encargosSetor.fgts
  return {
    mes: format(mes, 'MMMM yyyy', { locale: ptBR }),
    diasTrabalhados,
    encargos,
    provisoes,
    totalMes: Object.values(encargos).reduce((a, b) => a + b, 0) + Object.values(provisoes).reduce((a, b) => a + b, 0)
  }
}

function calcularRelatorioCompleto(funcionario) {
  const dataEntrada = parseYMD(funcionario.dataEntrada)
  const dataSaida = funcionario.dataSaida ? parseYMD(funcionario.dataSaida) : new Date()
  const meses = []
  let mesAtual = startOfMonth(dataEntrada)
  while (mesAtual <= dataSaida) {
    const calculoMes = calcularEncargosProvisoesMensais(funcionario, mesAtual)
    if (calculoMes) meses.push(calculoMes)
    mesAtual = new Date(mesAtual.setMonth(mesAtual.getMonth() + 1))
  }
  return meses
}

export default function FuncionariosPage() {
  const { funcionarios, setFuncionarios } = useOutletContext()
  const { user } = useAuth()
  const [formData, setFormData] = useState({ nome: '', cargo: '', salarioBase: '', dataEntrada: '', dataSaida: '', setor: 'comercio', cpfCnpj: '' })
  const [errors, setErrors] = useState({ cpfCnpj: '' })
  const [dateErrors, setDateErrors] = useState({ entrada: '', saida: '' })

  const handleInputChange = (e) => {
    const { name, value } = e.target
    if (name === 'cpfCnpj') {
      const masked = formatCpfCnpj(value)
      const digits = onlyDigits(masked)
      let err = ''
      if (digits.length > 0) {
        const isCpf = digits.length === 11
        const isCnpj = digits.length === 14
        if (!isCpf && !isCnpj) err = 'Informe CPF (11) ou CNPJ (14)'
        else if (isCpf && !isValidCPF(digits)) err = 'CPF inválido'
        else if (isCnpj && !isValidCNPJ(digits)) err = 'CNPJ inválido'
      }
      setErrors(prev => ({ ...prev, cpfCnpj: err }))
      return setFormData(prev => ({ ...prev, [name]: masked }))
    }
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // Validate dates locally to avoid timezone issues
    const adm = parseYMD(formData.dataEntrada)
    const fim = formData.dataSaida ? parseYMD(formData.dataSaida) : new Date()
    const de = { entrada: '', saida: '' }
    if (!adm) de.entrada = 'Data de entrada inválida'
    if (formData.dataSaida && !fim) de.saida = 'Data final inválida'
    if (adm && fim && fim < adm) de.saida = 'Data final anterior à entrada'
    setDateErrors(de)
    if (de.entrada || de.saida) return
    const digits = onlyDigits(formData.cpfCnpj)
    let err = ''
    if (digits.length > 0) {
      const isCpf = digits.length === 11
      const isCnpj = digits.length === 14
      if (!isCpf && !isCnpj) err = 'Informe CPF (11) ou CNPJ (14)'
      else if (isCpf && !isValidCPF(digits)) err = 'CPF inválido'
      else if (isCnpj && !isValidCNPJ(digits)) err = 'CNPJ inválido'
    }
    setErrors(prev => ({ ...prev, cpfCnpj: err }))
    if (err) return
    // deduplicate by (nome + dataEntrada + dataSaida)
    const dup = (funcionarios || []).some(f =>
      f.nome.trim().toLowerCase() === formData.nome.trim().toLowerCase() &&
      String(f.dataEntrada || '') === String(formData.dataEntrada || '') &&
      String(f.dataSaida || '') === String(formData.dataSaida || '')
    )
    if (dup) return

    const novoFuncionario = {
      ...formData,
      id: Date.now(),
      salarioBase: parseFloat(formData.salarioBase),
      cpfCnpj: digits || undefined,
      relatorioMensal: []
    }
    novoFuncionario.relatorioMensal = calcularRelatorioCompleto(novoFuncionario)
    try {
      const admLocal = parseYMD(novoFuncionario.dataEntrada)
      const fimLocal = novoFuncionario.dataSaida ? parseYMD(novoFuncionario.dataSaida) : new Date()
      novoFuncionario.calc = calcularFuncionario({ salario: novoFuncionario.salarioBase, adm: admLocal, fim: fimLocal, params: {} })
    } catch {}
    setFuncionarios(prev => [ ...prev, novoFuncionario ])
    // persist for current user
    if (user?.uid) {
      upsertEmployee(user.uid, novoFuncionario).catch(() => {})
    }
    setFormData({ nome: '', cargo: '', salarioBase: '', dataEntrada: '', dataSaida: '', setor: 'comercio', cpfCnpj: '' })
  }

  const globalPieData = useMemo(() => {
    const t = aggregateByVerba(funcionarios)
    return [
      { name: 'Salário', value: t.salario },
      { name: 'FGTS', value: t.fgts },
      { name: 'INSS', value: t.inss },
      { name: 'IRRF', value: t.irrf },
      { name: '13º', value: t.decimoTerceiro },
      { name: 'Férias', value: t.ferias },
      { name: '1/3 Férias', value: t.tercoFerias },
      t.multaFgts40 ? { name: 'Multa FGTS 40%', value: t.multaFgts40 } : null,
    ].filter(Boolean)
  }, [funcionarios])

  return (
    <div className="grid gap-16">
      <section className="global-aggregates" aria-labelledby="aggTitle">
        <h2 id="aggTitle" className="sr-only">Totais por verba</h2>
        <EncargosPie data={globalPieData} variant="total" />
      </section>
      <Card>
        <h2 style={{ marginTop: 0 }}>Cadastro de Funcionário</h2>
        <form onSubmit={handleSubmit} className="grid" style={{ gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <Input label="Nome" name="nome" value={formData.nome} onChange={handleInputChange} required />
          <Input label="Cargo" name="cargo" value={formData.cargo} onChange={handleInputChange} required />
          <Input label="Salário Base" name="salarioBase" type="number" step="0.01" min="0" value={formData.salarioBase} onChange={handleInputChange} required />
          <DateField label="Data de Entrada" name="dataEntrada" value={formData.dataEntrada} onChange={handleInputChange} required error={dateErrors.entrada} />
          <DateField label="Data de Saída" name="dataSaida" value={formData.dataSaida} onChange={handleInputChange} error={dateErrors.saida} />
          <Select label="Setor" name="setor" value={formData.setor} onChange={handleInputChange} required>
            <option value="comercio">Comércio</option>
            <option value="industria">Indústria</option>
            <option value="servicos">Serviços</option>
          </Select>
          <Input label={labelCpfCnpj(formData.cpfCnpj)} name="cpfCnpj" value={formData.cpfCnpj} onChange={handleInputChange} placeholder="Apenas números" error={errors.cpfCnpj} />
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <Button type="submit" variant="primary">Adicionar</Button>
          </div>
        </form>
        <div className="text-sm" aria-live="polite" style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <span className="badge" style={{ background: 'var(--accent-50)', padding: '4px 8px', borderRadius: 999 }}>
            Entrada: {fmtDMY(formData.dataEntrada)} (interpretação interna: {fmtYMD(parseYMD(formData.dataEntrada)) || '—'})
          </span>
          <span className="badge" style={{ background: 'var(--accent-50)', padding: '4px 8px', borderRadius: 999 }}>
            Saída p/ cálculo: {fmtDMY(formData.dataSaida) || '—'} (interpretação interna: {fmtYMD(formData.dataSaida ? parseYMD(formData.dataSaida) : null) || '—'})
          </span>
        </div>
      </Card>

      <div className="grid" style={{ gap: 16 }}>
        {funcionarios.map((funcionario) => {
          const resumo = funcionario.relatorioMensal || []
          const pieData = [
            { name: 'INSS', value: resumo.reduce((acc, r) => acc + r.encargos.inss, 0) },
            { name: 'FGTS', value: resumo.reduce((acc, r) => acc + r.encargos.fgts, 0) },
            { name: 'Terceiros', value: resumo.reduce((acc, r) => acc + r.encargos.terceiros, 0) },
            { name: 'RAT', value: resumo.reduce((acc, r) => acc + r.encargos.rat, 0) },
          ]
          const totalPeriodo = resumo.reduce((acc, r) => acc + r.totalMes, 0)
          return (
            <Card key={funcionario.id}>
              <div className="grid" style={{ gap: 12 }}>
                <div className="grid" style={{ gap: 6 }}>
                  <h3 style={{ margin: 0 }}>{funcionario.nome} — {funcionario.cargo}</h3>
                  <div style={{ color: 'var(--color-ink-soft)', fontSize: 'var(--fs-14)' }}>
                    <span style={{ fontWeight: 500 }}>Setor:</span> {funcionario.setor} · {labelCpfCnpj(funcionario.cpfCnpj)}: {formatCpfCnpj(funcionario.cpfCnpj)} · Salário Base: R$ {funcionario.salarioBase.toFixed(2)} · Entrada/Saída: <span title="America/Fortaleza — data sem horas (00:00 local)">{fmtDMY(funcionario.dataEntrada)} / {fmtDMY(funcionario.dataSaida) || 'Hoje'}</span>
                  </div>
                </div>
                <div className="grid" style={{ gap: 16, gridTemplateColumns: '1fr 2fr' }}>
                  <Card>
                    <div className="kpi">
                      <div className="label">Total do Período</div>
                      <div className="value">R$ {totalPeriodo.toFixed(2)}</div>
                      <div className="badge">Soma de encargos e provisões</div>
                    </div>
                  </Card>
                  <EncargosPie data={pieData} />
                </div>
                <div className="grid" style={{ gap: 16 }}>
                  {resumo.map((relatorio, index) => (
                    <Card key={index}>
                      <h4 style={{ marginTop: 0 }}>{relatorio.mes}</h4>
                      <p style={{ color: 'var(--color-ink-soft)', fontSize: 'var(--fs-14)' }}>Dias trabalhados: {relatorio.diasTrabalhados}</p>
                      <div className="grid" style={{ gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                          <h5>Encargos</h5>
                          <ul>
                            <li>INSS Patronal: R$ {relatorio.encargos.inss.toFixed(2)}</li>
                            <li>FGTS: R$ {relatorio.encargos.fgts.toFixed(2)}</li>
                            <li>Terceiros: R$ {relatorio.encargos.terceiros.toFixed(2)}</li>
                            <li>RAT: R$ {relatorio.encargos.rat.toFixed(2)}</li>
                          </ul>
                        </div>
                        <div>
                          <h5>Provisões</h5>
                          <ul>
                            <li>13º Salário: R$ {relatorio.provisoes.decimoTerceiro.toFixed(2)}</li>
                            <li>Férias: R$ {relatorio.provisoes.ferias.toFixed(2)}</li>
                            <li>1/3 Férias: R$ {relatorio.provisoes.tercoFerias.toFixed(2)}</li>
                            <li>FGTS sobre Provisões: R$ {relatorio.provisoes.fgtsProvisoes.toFixed(2)}</li>
                          </ul>
                        </div>
                      </div>
                      <div style={{ borderTop: `1px solid var(--color-border)`, paddingTop: 10 }}>
                        <strong>Total do Mês: R$ {relatorio.totalMes.toFixed(2)}</strong>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function fmtDMY(value) {
  if (!value) return ''
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseYMD(value) : value
  if (!d || isNaN(d)) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
function fmtYMD(d) {
  if (!d) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
