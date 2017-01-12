import React, { Children, Component, PropTypes } from 'react'

import classNames from 'classnames'
import debounce from 'lodash/debounce'
import fetchJson from '../utils/fetch'
import hasValue from '../utils/hasValue'
import isEqual from 'lodash/isEqual'
import isFunction from 'lodash/isFunction'
import keys from 'lodash/keys'
import path from 'path'
import provideClickOutside from 'react-click-outside'
import qs from 'qs'
import uniqueId from 'lodash/uniqueId'
import { selectPropTypes } from '../utils/selectPropTypes'
import { stopPropagation } from '../utils/events'

import SelectDropdown from './SelectDropdown'
import SelectError from './SelectError'
import SelectSelection from './SelectSelection'


// TODO: styles
// TODO: multiselect
// TODO: label
// TODO: optgroups
// TODO: lang module
class Select extends Component {
    static propTypes = {
        /**
         * Whether allow user to clear select or not
         */
        allowClear: PropTypes.bool,
        /**
         * Whether to focus itself on mount
         */
        autoFocus: PropTypes.bool,
        defaultValue: selectPropTypes.optionId,
        disabled: PropTypes.bool,
        /**
         * You can provide error message to display or just boolean to highlight select container with error styles
         */
        error: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
        /**
         * Provide custom messages
         */
        lang: PropTypes.object,
        layout: PropTypes.shape({
            /**
             * Container's width
             */
            width: PropTypes.string,
            /**
             * Defines whether SelectDropdown should be opened above or below the container.
             * default: 'below'
             */
            // TODO: define position automatically depends on SelectContainer position in the viewport
            dropdownVerticalPosition: PropTypes.oneOf(['above', 'below']),
            dropdownHorizontalPosition: PropTypes.oneOf(['left', 'right'])
        }),
        name: PropTypes.string,
        /**
         * Array of option items
         */
        options: PropTypes.arrayOf(PropTypes.shape({
            id: selectPropTypes.optionId.isRequired,
            text: selectPropTypes.selection.isRequired,
        })),
        /**
         * Provide needed options to fetch data from server by term query
         */
        request: PropTypes.shape({
            /**
             * Delays between requests
             */
            delay: PropTypes.number, // default 500
            endpoint: PropTypes.string.isRequired,
            /**
             * Whenever to fetch options once at mount or on searchTermChange
             */
            once: PropTypes.bool,
            /**
             * Additional query params
             */
            params: PropTypes.object,
            /**
             * You can provide custom ajaxClient instead of built-in fetchJson
             * which invokes on termChange or once at component mount with endpoint
             * and query params as string argument
             */
            ajaxClient: PropTypes.func,
            /**
             * Pass in function that will used to map response data array
             * `{ id: number|string, text: string|element }`
             */
            responseDataFormatter: PropTypes.func,
            /**
             * Name of the key of searchTerm query param
             * `{ [termQuery]: 'search term' }`
             */
            termQuery: PropTypes.string,
        }),
        onSelect: PropTypes.func,
        placeholder: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
        search: PropTypes.shape({
            /**
             * Minimum results amount before showing search input
             */
            minimumResults: PropTypes.number,
            /**
             * Minimum characters before sending request
             */
            minLength: PropTypes.number,
        }),
        /**
         * Search input change callback
         */
        onSearchTermChange: PropTypes.func,
        /**
         * Value can be set by providing option id
         */
        value: selectPropTypes.optionId,
    }

    static defaultProps = {
        allowClear: false,
        disabled: false,
        lang: {},
        layout: {
            dropdownHorizontalPosition: 'left',
            dropdownVerticalPosition: 'below',
            width: '245px',
        },
        name: uniqueId('reactSelect_'),
        options: null,
        search: {
            minimumResults: 20,
            minLength: 3,
        },
    }

    static initialState = () => ({
        dropdownOpened: false,
        error: null,
        highlighted: null,
        isPending: false,
        options: [],
        requestSearch: false,
        searchTerm: '',
        value: null,
    })

    get selectNode() {
        return this.refs.selectContainer
    }

    get value() {
        const { selectedOption } = this.state

        return selectedOption ? selectedOption.id : null
    }

    get options() {
        return this.state.options
    }

    clear() {
        this._onClearSelection()
    }

    constructor(props, context) { // eslint-disable-line consistent-return
        super(props, context)

        this.state = {}

        const {
            children,
            defaultValue,
            error,
            options,
            request,
            value,
        } = props

        if (request && typeof request.endpoint !== 'string') {
            throw new Error('Request endpoint must be a string.')
        }

        /**
         * @var {boolean} does select need to send request for options on searchTermChange
         */
        const requestSearch = request && !request.once

        if (requestSearch) {
            const requestDelay = (request && request.delay) ? request.delay : 500

            this._requestOptions = debounce(this._request, requestDelay)
        } else {
            this._requestOptions = this._request
        }

        /**
         * @type {{
         *  dropdownOpened: boolean,
         *  error: string|boolean,
         *  highlighted: number,
         *  isPending: boolean,
         *  options: array,
         *  requestSearch: boolean
         *  searchTerm: string,
         *  value: string,
         * }}
         */
        this.state = Object.assign(Select.initialState(), {
            error,
            options: this._setOptions(options, children),
            requestSearch,
            value: value || defaultValue,
        })
    }

    componentWillReceiveProps(newProps) {
        const {
            disabled,
            error,
            options,
            children,
            value,
        } = newProps
        const isValueDefined = typeof value !== 'undefined'

        if (this._isValidValue(value)) {

        } else if (isValueDefined && typeof newProps.onSelect === 'undefined' && typeof this.props.onSelect === 'undefined') {
            /* eslint-disable */
            console.error(`Warning: You're setting value for Select component throught props
                but not passing onSelect callback which can lead to unforeseen consequences(bugs).
                Please consider using onSelect callback or defaultValue instead of value`)
            /* eslint-enable */
        }

        if (disabled) {
            this._closeDropdown()
        }

        this.setState(state => {
            let newValue = state.value

            if (isValueDefined) {
                newValue = value === null ? null : String(value)
            }

            return {
                disabled,
                options: this._setOptions(options, children),
                value: newValue,
                error: hasValue(error) ? error : state.error
            }
        })
    }

    shouldComponentUpdate = ({ error, disabled, value, children }, nextState) => (
        error !== this.props.error
        || disabled !== this.props.disabled
        || value !== this.state.value
        || !isEqual(children, this.props.children)
        || !isEqual(nextState, this.state)
    )

    componentDidMount = () => {
        const { autoFocus, request } = this.props

        if (autoFocus) this._focusContainer()
        if (request && request.once) this._requestOptions()
    }

    componentWillUnmount = () => {
        if (this.state.requestSearch) {
            this._requestOptions.cancel()
        }
    }

    /**
     * Close SelectDropdown on click outside using 'react-click-outside' library
     */
    handleClickOutside = () => {
        this._closeDropdown()
    }

    _isValidValue = value => {
        const { options } = this.state
        let isValid = false

        if (value === null) {
            isValid = true
        } else if (options && options.length) {
            isValid = options.some(({ id }) => id === value)
        }

        return isValid
    }

    _hasResponseDataFormatter = () => {
        if (!hasValue(this.hasResponseDataFormatter)) {
            this.hasResponseDataFormatter = isFunction(this.props.request.responseDataFormatter)
        }

        return this.hasResponseDataFormatter
    }

    // @fixme: getChildrenTextContent function is not perfect tbh
    static getChildrenTextContent = element => {
        if (typeof element === 'string') {
            return element
        }

        return Select.getChildrenTextContent(Children.toArray(element)[0].props.children)
    }

    _request = searchTerm => {
        const {
            request: {
                ajaxClient,
                endpoint,
                params,
                responseDataFormatter,
                termQuery,
            }
        } = this.props

        function composeFetchPath(endpoint, params = {}, { searchTerm, termQuery }) {
            let fetchPath
            let fetchParams = Object.assign({}, params)

            if (searchTerm) {
                if (!termQuery) throw new Error('Provide request.termQuery prop')
                fetchParams = Object.assign(fetchParams, { [termQuery]: searchTerm })
            }

            if (keys(fetchParams)) {
                fetchPath = path.join(endpoint, '?' + qs.stringify(fetchParams))
            }

            return fetchPath
        }

        const fetchClient = ajaxClient || fetchJson
        const fetchPath = composeFetchPath(endpoint, params, { searchTerm, termQuery })

        this.setState({
            error: this.props.error || null,
            isPending: true,
        })

        fetchClient(fetchPath)
            .then(data => {
                let options = data
                if (this._hasResponseDataFormatter()) {
                    options = data.map(responseDataFormatter)
                }

                this.setState({
                    options: this._setOptions(options),
                    isPending: false,
                })
            })
            .catch(error => {
                this.setState({
                    error: error.message || true,
                    isPending: false,
                })
            })
    }

    _closeDropdown = () => {
        this.setState({
            dropdownOpened: false,
            highlighted: null
        })
    }

    _focusContainer = () => {
        const x = window.scrollX
        const y = window.scrollY

        window.scrollTo(x, y)
        if (this.refs.selectContainer) {
            this.refs.selectContainer.focus()
        }
    }

    _setOptions = (options, children) => {
        let stateOptions = this.state.options || []

        if (Array.isArray(options) && options.length) {
            stateOptions = options.map(({ id, text }) => {
                if (typeof id === 'undefined' || typeof text === 'undefined') {
                    throw new Error('options array is not formatted properly, option object must have "id" and "text"');
                }

                return {
                    id: String(id),
                    text
                }
            })
        } else if (Children.count(children)) {
            stateOptions = Children.toArray(children)
                .filter(({ type }) => type === 'option')
                .map(({ props: { children: text, value: id } }) => ({ id: String(id), text }))
        }

        return stateOptions
    }

    /**
     * Returns option object from options array by given index
     * @param {number} index
     * @return {object} <option>
     * @private
     */
    _getOptionByIndex = index => {
        const { options } = this.state

        if (index > options.length || index < 0) {
            throw new Error('Invalid index provided')
        }

        return options[index]
    }

    _getOptionById = value => {
        const { options } = this.state

        if (options && options.length) {
            return options.find(({ id }) => id === value) // eslint-disable-line eqeqeq
        }

        return null
    }

    _onContainerClick = () => {
        this.setState(state => {
            const { dropdownOpened, disabled } = state

            return disabled ? state : ({ dropdownOpened: !dropdownOpened })
        })
    }

    /**
     * Handle keyboard controls
     * @param {object} event
     */
    _onContainerKeyDown = event => {
        if (this.props.disabled) return

        const KEY_FUNTIONS = {
            ArrowUp: this._setHighlightedOption.bind(null, -1),
            ArrowDown: this._setHighlightedOption.bind(null, 1),
            Enter: this._selectHighlighted,
            ' ': this._selectHighlighted, // 'Space' key
            Escape: this._closeDropdown
        }

        const { key } = event

        if (!KEY_FUNTIONS[key]) return

        event.preventDefault()
        // Handle key click
        KEY_FUNTIONS[key]()
    }

    _onClearSelection = () => {
        // Dont clear when disabled, dont fire extra event when value is already cleared
        if (!this.state.disabled && this.state.value !== null) {
            this._onSelect(null)
        }
    }

    /**
     * Setting selected value
     * @param {object} option - option object from data array
     */
    _onSelect = option => {
        const { name, onSelect } = this.props
        // Setup structure of selection event
        const value = option ? option.id : null
        const selectionEvent = {
            type: 'select',
            target: {
                name,
                option,
                value,
            }
        }

        this.setState({ value }, () => {
            if (isFunction(onSelect)) {
                onSelect(selectionEvent)
            }
        })

        this._closeDropdown()
        this._focusContainer()
    }

    /**
     * Handle option selection via user click
     * @param {number} id - options id
     */
    _onSelectOption = id => {
        // Get selected option and pass it into onSelect method for further processing
        const selectedOption = this._getOptionById(id)

        this._onSelect(selectedOption)
    }


    /**
     * Set next highlighted option via 'ArrowUp' or 'ArrowDown' key
     * @param {number} direction (can be -1 or 1)
     */
    _setHighlightedOption = direction => {
        const { options, disabled, highlighted, dropdownOpened } = this.state

        // do nothing if disabled or there are no options
        if (disabled || !options || !options.length) return

        const optionsLength = options.length - 1
        const nextHighlighted = (highlighted !== null) ?
        highlighted + direction
            : 0

        // TODO: scroll SelectDropdown block to show highlighted item when overflows
        // If dropdown not opened or there is no highlighted item yet
        if (!dropdownOpened || highlighted === null
            // highlight first option after click 'ArrowDown' on the last one
            || nextHighlighted > optionsLength) {
            this.setState({ highlighted: 0, dropdownOpened: true })
        } else if (nextHighlighted < 0) {
            // Highlight last option after click 'ArrowUp' on the first one
            this.setState({ highlighted: optionsLength })
        } else {
            // Highlight next option
            this.setState({ highlighted: nextHighlighted })
        }
    }

    /**
     * Select current highlighted option
     */
    _selectHighlighted = () => {
        const { options, highlighted, dropdownOpened } = this.state

        // If dropdown not opened or there is no highlighted item yet
        if (!dropdownOpened || highlighted === null) {
            // Open dropdown and hightlight first item
            this.setState({
                dropdownOpened: true,
                highlighted: 0,
            })
        } else {
            // Select highlighted item
            this._onSelect(options[highlighted])
        }
    }

    _getSelectContainerClassName = () => {
        const {
            className,
            disabled,
            layout: {
                dropdownHorizontalPosition,
                dropdownVerticalPosition,
            },
            error,
        } = this.props
        const {
            dropdownOpened,
            isPending,
            value,
        } = this.state

        return classNames('pure-react-select__container ' + (className || ''), {
            'pure-react-select__container--above': dropdownVerticalPosition === 'above',
            'pure-react-select__container--below': dropdownVerticalPosition !== 'above',
            'pure-react-select__container--disabled': disabled,
            'pure-react-select__container--error': error,
            'pure-react-select__container--left': dropdownHorizontalPosition !== 'right',
            'pure-react-select__container--open': dropdownOpened,
            'pure-react-select__container--pending': isPending,
            'pure-react-select__container--right': dropdownHorizontalPosition === 'right',
            'pure-react-select__container--selected': hasValue(value),
        })
    }

    _isClearable = () => {
        const { allowClear } = this.props
        const { value } = this.state

        return (allowClear && hasValue(value))
    }

    _getOptionsList = () => {
        const { options, searchTerm } = this.state
        let optionsList = options || []

        if (searchTerm && optionsList.length) {
            const searchRegExp = new RegExp(searchTerm, 'gi')
            optionsList = options.filter(({ text: element }) => {
                const elementText = Select.getChildrenTextContent(element)

                return searchRegExp.test(elementText)
            })
        }

        return optionsList
    }

    _onSearchTermChange = e => {
        const { target: { value: term } } = e
        const { search: { minLength = 3 }, onSearchTermChange } = this.props
        const { searchTerm: stateSearchTerm, requestSearch } = this.state

        // If size of text is increases
        // const isTextIncreasing = term && (!stateSearchTerm || term.length > stateSearchTerm.length)

        // reset searchTerm if term === ''
        const searchTerm = term || null

        if (isFunction(onSearchTermChange)) {
            onSearchTermChange(e)
        }

        // If requestSearch enabled
        if (searchTerm && searchTerm.length >= minLength && requestSearch) {
            this._requestOptions(searchTerm)
        }

        this.setState({ searchTerm })
    }

    render() {
        const {
            disabled,
            error,
            lang,
            layout: { width },
            placeholder,
            search,
        } = this.props
        const {
            dropdownOpened,
            highlighted,
            isPending,
            requestSearch,
            searchTerm,
            value,
        } = this.state
        const selectedOption = this._getOptionById(value)

        return (
            <span ref='selectContainer'
                  className={ this._getSelectContainerClassName() }
                  style={{ width }}
                  disabled={ disabled }
                  tabIndex='1'
                  role='combobox'
                  onClick={ this._onContainerClick }
                  onKeyDown={ this._onContainerKeyDown }>
                <SelectSelection {...{
                    clearable: this._isClearable(),
                    onClearSelection: stopPropagation(this._onClearSelection),
                    placeholder,
                    selection: selectedOption && selectedOption.text,
                }}/>
                {
                    dropdownOpened ?
                        <SelectDropdown {...{
                            highlighted,
                            isPending,
                            lang,
                            onSearchTermChange: this._onSearchTermChange,
                            onSelect: this._onSelectOption,
                            options: this._getOptionsList(),
                            requestSearch,
                            search,
                            searchTerm,
                            value,
                        }}/>
                        : <SelectError error={ error }/>
                }
             </span>
        )
    }
}

export default provideClickOutside(Select)
